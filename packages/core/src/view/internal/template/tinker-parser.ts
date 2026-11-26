// Tinker's own template parser. It reads the markup of a template without a DOM,
// so it runs in Node as well as in the browser (the build step that compiles
// templates needs that).
//
// For a well-formed template it gives the tree the browser's HTML parser gave.
// Where the browser guesses, this parser reports an error, or keeps what was written:
// - Names keep their case: `[ariaLabel]` stays `[ariaLabel]`.
// - Any element can be closed by `/>`, not only the HTML void elements (`<input>`,
//   `<br>`, ...), which need no closing tag.
// - Nothing is closed implicitly: `<p>` inside `<p>`, or a missing `</li>`, is an
//   error. A duplicate attribute is an error too, not silently dropped.
// - Text between `{{` and `}}` is not read as markup, so an expression can hold `<`.
//
// Errors are TemplateSyntaxError, with the line and column where the problem starts.
// The scanner is pure: each step takes the state it was given (where it is, which elements
// are open, the errors found so far) and returns the value it read with the next state. A
// predictable error is a value, and nothing in the scanner throws. The scanner goes on after
// an error (parseAll returns them all), and parse returns the first one as a Left.
// Each element and text node carries its span, the offsets it covers in the source.
// Known limits (see IMPROVEMENTS.md): only a few named entities are decoded, and
// `script` and `style` are read as raw text.
// Comments are dropped.

import { Left, match, Right, type Either } from "@tinker/functional";
import type { AttributeNode, ElementNode, TemplateNode, TextNode } from "./ast.ts";
import { decodeReferences } from "./entities.ts";
import { blockBodyBrace } from "./blocks.ts";
import type { TemplateParser } from "./parser.ts";

/** A template that does not follow the syntax. `line` and `column` are 1-based. */
export class TemplateSyntaxError extends Error {
  readonly line: number;
  readonly column: number;
  /** The problem, without its place: `message` is `line:column: reason`. */
  readonly reason: string;

  constructor(reason: string, line: number, column: number) {
    super(`${line}:${column}: ${reason}`);
    this.name = "TemplateSyntaxError";
    this.line = line;
    this.column = column;
    this.reason = reason;
  }
}

/** The errors of a template as one error: the first one's place, and every problem in it. */
export function combineSyntaxErrors(errors: readonly TemplateSyntaxError[]): TemplateSyntaxError {
  const [first] = errors;
  if (errors.length === 1) {
    return first!;
  }
  const reason = errors.map((error) => `${error.reason} (at ${error.line}:${error.column})`)
    .join("; ");
  return new TemplateSyntaxError(reason, first!.line, first!.column);
}

/** Reads template source into Tinker's syntax tree (ast.ts). */
export class TinkerTemplateParser implements TemplateParser {
  /** The tree, or the first TemplateSyntaxError of the source. */
  parse(source: string): Either<readonly TemplateNode[], TemplateSyntaxError> {
    const { nodes, errors } = this.parseAll(source);
    return errors.length > 0
      ? Left.of<TemplateSyntaxError, readonly TemplateNode[]>(errors[0]!)
      : Right.of<readonly TemplateNode[], TemplateSyntaxError>(nodes);
  }

  /**
   * The tree and every error of the source. The parser goes on after an error, so a
   * template with several problems reports them all; the tree has what it could read.
   */
  parseAll(source: string): {
    nodes: readonly TemplateNode[];
    errors: readonly TemplateSyntaxError[];
  } {
    return new Scanner(source)
      .scan();
  }
}

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);
/** Elements whose content is text, not markup, up to their closing tag. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);
/** Elements whose content is text with references decoded, not markup, up to their closing tag. */
const ESCAPABLE_RAW_TEXT_ELEMENTS = new Set(["textarea", "title"]);

const TAG_NAME = /[A-Za-z][\w:.-]*/y;
const ATTRIBUTE_NAME = /[^\s"'<>/=]+/y;
const UNQUOTED_VALUE = /[^\s"'<>=`]+/y;
const SPACES = /\s*/y;
/** Where text stops: a comment, a tag, a closing tag or a declaration. */
const MARKUP = /<[A-Za-z/!]/y;
const ELEMENT_START = /<[A-Za-z]/y;

/** The scanner's state: where it is, which elements are open, and the errors found so far. */
interface State {
  readonly pos: number;
  readonly open: readonly string[];
  readonly found: readonly TemplateSyntaxError[];
}

/** A step's result, and the state after it. A failed step leaves the state where it stopped. */
interface Step<T> {
  readonly result: Either<T, TemplateSyntaxError>;
  readonly state: State;
}

const done = <T>(value: T, state: State): Step<T> => ({
  result: Right.of<T, TemplateSyntaxError>(value),
  state,
});

const failed = <T>(error: TemplateSyntaxError, state: State): Step<T> => ({
  result: Left.of<TemplateSyntaxError, T>(error),
  state,
});

/** The next step, run on the value of this one: the state threads through, and a failure stops. */
function then<T, U>(step: Step<T>, next: (value: T, state: State) => Step<U>): Step<U> {
  return match<T, TemplateSyntaxError, Step<U>>(step.result, {
    Right: (value) => next(value, step.state),
    Left: (error) => failed<U>(error, step.state),
  });
}

/** The state with `error` added to the errors found. */
const addError = (state: State, error: TemplateSyntaxError): State => ({
  ...state,
  found: [...state.found, error],
});

/** The state moved to the next `<` after `from`, or to the end of the source. */
function resume(source: string, state: State, from: number): State {
  const next = source.indexOf("<", from + 1);
  return { ...state, pos: next === -1 ? source.length : next };
}

/** Reads the source from left to right, one node at a time, with no state kept between calls. */
class Scanner {
  constructor(private readonly source: string) {}

  /** The whole template: its nodes, and the errors found in it. */
  scan(): { nodes: TemplateNode[]; errors: TemplateSyntaxError[] } {
    const nodes: TemplateNode[] = [];
    let state: State = { pos: 0, open: [], found: [] };
    for (;;) {
      const read = this.nodes(state);
      nodes.push(...read.nodes);
      state = read.state;
      if (this.atEnd(state)) {
        return { nodes, errors: [...state.found] };
      }
      // A closing tag with no element open: report it, and go on after it.
      state = resume(
        this.source,
        addError(state, this.error("closing tag with no element open", state.pos)),
        state.pos,
      );
    }
  }

  /** Nodes up to a closing tag or the end. The closing tag is not consumed. */
  private nodes(start: State): { nodes: TemplateNode[]; state: State } {
    const nodes: TemplateNode[] = [];
    let state = start;
    while (!this.atEnd(state) && !this.startsWith(state, "</")) {
      const from = state.pos;
      const step = this.node(state);
      const next = match(step.result, {
        Right: (items) => ({ items, state: step.state }),
        // The node is dropped; scanning goes on at the next tag after the problem.
        Left: (error) => ({
          items: [] as TemplateNode[],
          state: resume(this.source, addError(step.state, error), Math.max(step.state.pos, from)),
        }),
      });
      nodes.push(...next.items);
      state = next.state;
    }
    return { nodes, state };
  }

  /** One node, or none for a comment. */
  private node(state: State): Step<TemplateNode[]> {
    if (this.startsWith(state, "<!--")) {
      return then(this.comment(state), (_, next) => done([], next));
    }
    if (this.startsWith(state, "<!")) {
      return failed(this.error("only comments can start with <!", state.pos), state);
    }
    if (this.matches(state, ELEMENT_START)) {
      return then(this.element(state), (element, next) => done([element], next));
    }
    return then(this.text(state), (text, next) => done([text], next));
  }

  private element(state: State): Step<ElementNode> {
    const start = state.pos;
    return then(this.name({ ...state, pos: start + 1 }), (name, afterName) =>
      then(this.startTagRest(start, name, afterName), ({ attributes, selfClosing }, afterTag) => {
        if (selfClosing || VOID_ELEMENTS.has(name.toLowerCase())) {
          return done(element(name, attributes, [], start, afterTag.pos), afterTag);
        }
        return then(this.contentOf(name, start, afterTag), (children, afterContent) =>
          done(element(name, attributes, children, start, afterContent.pos), afterContent));
      }));
  }

  /** The children of an element, and its closing tag, which is consumed. */
  private contentOf(name: string, start: number, state: State): Step<TemplateNode[]> {
    const lower = name.toLowerCase();
    if (RAW_TEXT_ELEMENTS.has(lower) || ESCAPABLE_RAW_TEXT_ELEMENTS.has(lower)) {
      // The text ends at the element's own closing tag, which is the one to consume.
      const raw = this.rawText(name, ESCAPABLE_RAW_TEXT_ELEMENTS.has(lower), state);
      return then(this.closingTag(name, start, raw.state), (_, after) => done(raw.nodes, after));
    }
    return this.childrenOf(name, start, state);
  }

  /** The children of an element, up to its closing tag, which is consumed. */
  private childrenOf(name: string, start: number, state: State): Step<TemplateNode[]> {
    const inside = { ...state, open: [...state.open, name] };
    const children: TemplateNode[] = [];
    let current: State = inside;
    for (;;) {
      const read = this.nodes(current);
      children.push(...read.nodes);
      const closed = this.closingTag(name, start, read.state);
      // A failed closing tag stops the element too, and its error goes up with it.
      const restored = { ...closed.state, open: state.open };
      const stops = match(closed.result, { Right: (isClosed) => isClosed, Left: () => true });
      if (stops) {
        return then({ result: closed.result, state: restored }, () => done(children, restored));
      }
      current = closed.state;
    }
  }

  /**
   * Text up to the next markup. `{{ }}` is skipped whole, so markup in it is not read, and so
   * is a block header up to its body's `{`: a `<` in a `@case` pattern is not a tag.
   */
  private text(state: State): Step<TextNode> {
    const start = state.pos;
    let pos = start;
    while (!this.atEndAt(pos) && !this.matchesAt(pos, MARKUP)) {
      pos = this.blockHeaderEnd(pos) ?? this.interpolationEnd(pos) ?? pos + 1;
    }
    return done(
      { kind: "text", value: decodeReferences(this.source.slice(start, pos)), span: { start, end: pos } },
      { ...state, pos },
    );
  }

  /** Where the body of a block header starting at `pos` opens, if a header starts there. */
  private blockHeaderEnd(pos: number): number | undefined {
    return this.source[pos] === "@" ? blockBodyBrace(this.source, pos) : undefined;
  }

  /** Where the `{{ }}` starting at `pos` ends, or undefined when there is none there. */
  private interpolationEnd(pos: number): number | undefined {
    const close = this.source.startsWith("{{", pos) ? this.source.indexOf("}}", pos + 2) : -1;
    return close === -1 ? undefined : close + 2;
  }

  /**
   * Everything up to the closing tag of a raw text element, as one text. Its references are
   * decoded when `decode` is set (`textarea`, `title`), and kept as written otherwise.
   */
  private rawText(
    name: string,
    decode: boolean,
    state: State,
  ): { nodes: TemplateNode[]; state: State } {
    const closing = new RegExp(`</${name}`, "gi");
    closing.lastIndex = state.pos;
    const closingAt = closing.exec(this.source);
    const start = state.pos;
    const end = closingAt?.index ?? this.source.length;
    const raw = this.source.slice(start, end);
    const value = decode ? decodeReferences(raw) : raw;
    return {
      nodes: value === "" ? [] : [{ kind: "text", value, span: { start, end } }],
      state: { ...state, pos: end },
    };
  }

  /**
   * The closing tag of the element `name`, at the current position. True when the element is
   * closed by it (consumed), or when it is left unclosed for an enclosing element (not consumed).
   * False for a closing tag that closes nothing open: it is reported and skipped, and the element
   * goes on. A failure when the source ends first, or the tag is malformed.
   */
  private closingTag(name: string, openedAt: number, state: State): Step<boolean> {
    if (this.atEnd(state)) {
      return failed(this.error(`<${name}> is never closed`, openedAt), state);
    }
    const at = state.pos;
    return then(this.name({ ...state, pos: at + 2 }), (closing, afterName) => {
      const spaced = this.take(afterName, SPACES).state;
      return then(this.expect(spaced, ">"), (_, afterGt) => {
        if (sameName(closing, name)) {
          return done(true, afterGt);
        }
        if (state.open.some((open) => sameName(open, closing))) {
          const reported = addError(afterGt, this.error(`<${name}> is never closed`, openedAt));
          return done(true, { ...reported, pos: at });
        }
        return done(false, addError(afterGt, this.error(`</${closing}> does not close <${name}>`, at)));
      });
    });
  }

  /** The attributes of a start tag, up to and including its `>` or `/>`. */
  private startTagRest(
    openedAt: number,
    name: string,
    start: State,
  ): Step<{ attributes: AttributeNode[]; selfClosing: boolean }> {
    let attributes: AttributeNode[] = [];
    let state = start;
    for (;;) {
      state = this.take(state, SPACES).state;
      if (this.atEnd(state)) {
        return failed(this.error(`<${name} is never closed`, openedAt), state);
      }
      const afterGt = this.consume(state, ">");
      if (afterGt !== undefined) {
        return done({ attributes, selfClosing: false }, afterGt);
      }
      const afterSlash = this.consume(state, "/>");
      if (afterSlash !== undefined) {
        return done({ attributes, selfClosing: true }, afterSlash);
      }
      const at = state.pos;
      const step = this.attribute(state);
      const next = match(step.result, {
        Right: (attribute) => attributes.some((known) => known.name === attribute.name)
          ? { attributes, state: addError(step.state, this.error(`duplicate attribute ${attribute.name}`, at)) }
          : { attributes: [...attributes, attribute], state: step.state },
        // The attribute is dropped, and the tag goes on at its end.
        Left: (error) => ({ attributes, state: this.skipToTagEnd(addError(step.state, error)) }),
      });
      attributes = next.attributes;
      state = next.state;
    }
  }

  /** Moves to the `>` that ends the start tag, or to the end of the source. */
  private skipToTagEnd(state: State): State {
    const end = this.source.indexOf(">", state.pos);
    return { ...state, pos: end === -1 ? this.source.length : end };
  }

  /** `name`, `name=value`, or `name="value"` (or with single quotes). */
  private attribute(state: State): Step<AttributeNode> {
    const taken = this.take(state, ATTRIBUTE_NAME);
    if (taken.text === "") {
      return failed(this.error("expected an attribute name", state.pos), state);
    }
    const named = this.take(taken.state, SPACES).state;
    const afterEquals = this.consume(named, "=");
    if (afterEquals === undefined) {
      return done({ name: taken.text, value: "" }, named);
    }
    const valued = this.take(afterEquals, SPACES).state;
    return then(this.attributeValue(valued), (value, after) =>
      done({ name: taken.text, value }, after));
  }

  private attributeValue(state: State): Step<string> {
    const quote = this.source[state.pos];
    if (quote === "\"" || quote === "'") {
      const close = this.source.indexOf(quote, state.pos + 1);
      if (close === -1) {
        return failed(this.error("attribute value is never closed", state.pos), state);
      }
      const value = this.source.slice(state.pos + 1, close);
      return done(decodeReferences(value, "attribute"), { ...state, pos: close + 1 });
    }
    const taken = this.take(state, UNQUOTED_VALUE);
    if (taken.text === "") {
      return failed(this.error("expected an attribute value", state.pos), state);
    }
    return done(decodeReferences(taken.text, "attribute"), taken.state);
  }

  private comment(state: State): Step<void> {
    const close = this.source.indexOf("-->", state.pos + 4);
    if (close === -1) {
      return failed(this.error("comment is never closed", state.pos), state);
    }
    return done(undefined, { ...state, pos: close + 3 });
  }

  private name(state: State): Step<string> {
    const taken = this.take(state, TAG_NAME);
    if (taken.text === "") {
      return failed(this.error("expected an element name", state.pos), state);
    }
    return done(taken.text, taken.state);
  }

  private expect(state: State, text: string): Step<void> {
    const after = this.consume(state, text);
    if (after === undefined) {
      return failed(this.error(`expected ${text}`, state.pos), state);
    }
    return done(undefined, after);
  }

  /** The state after `text`, if the source is at it; undefined when it is not. */
  private consume(state: State, text: string): State | undefined {
    return this.startsWith(state, text) ? { ...state, pos: state.pos + text.length } : undefined;
  }

  /** The text `pattern` matches at the state's position, and the state after it (`""` for none). */
  private take(state: State, pattern: RegExp): { text: string; state: State } {
    const sticky = new RegExp(pattern.source, pattern.flags);
    sticky.lastIndex = state.pos;
    const matched = sticky.exec(this.source);
    const text = matched === null ? "" : matched[0];
    return { text, state: { ...state, pos: state.pos + text.length } };
  }

  private matches(state: State, pattern: RegExp): boolean {
    return this.matchesAt(state.pos, pattern);
  }

  private matchesAt(pos: number, pattern: RegExp): boolean {
    const sticky = new RegExp(pattern.source, pattern.flags);
    sticky.lastIndex = pos;
    return sticky.test(this.source);
  }

  private startsWith(state: State, text: string): boolean {
    return this.source.startsWith(text, state.pos);
  }

  private atEnd(state: State): boolean {
    return this.atEndAt(state.pos);
  }

  private atEndAt(pos: number): boolean {
    return pos >= this.source.length;
  }

  /** An error at `at`, with its line and column. */
  private error(message: string, at: number): TemplateSyntaxError {
    const line = this.source.slice(0, at)
      .split("\n").length;
    const column = at - this.source.lastIndexOf("\n", at - 1);
    return new TemplateSyntaxError(message, line, column);
  }
}

/** An element node, from its parts. */
function element(
  name: string,
  attributes: AttributeNode[],
  children: TemplateNode[],
  start: number,
  end: number,
): ElementNode {
  return { kind: "element", name, attributes, children, span: { start, end } };
}

/** Whether two element names are the same: names are compared without their case. */
function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
