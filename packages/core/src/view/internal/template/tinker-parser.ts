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
// The parser goes on after an error (parseAll returns them all); parse throws the first.
// Each element and text node carries its span, the offsets it covers in the source.
// Known limits (see IMPROVEMENTS.md): only a few named entities are decoded, and
// `script` and `style` are read as raw text.
// Comments are dropped.

import { Maybe } from "@tinker/functional";
import { decodeHTML, decodeHTMLAttribute } from "entities";
import type { AttributeNode, ElementNode, TemplateNode, TextNode } from "./ast.ts";
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
  /** The tree. Throws the first TemplateSyntaxError of the source, if there is one. */
  parse(source: string): readonly TemplateNode[] {
    const { nodes, errors } = this.parseAll(source);
    if (errors.length > 0) {
      throw errors[0];
    }
    return nodes;
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

/** Reads the source from left to right, one node at a time. */
class Scanner {
  private pos = 0;

  constructor(private readonly source: string) {}

  /** Every error found, in the order they were found. */
  private readonly found: TemplateSyntaxError[] = [];
  /** The names of the elements being read, outermost first. */
  private readonly open: string[] = [];

  /** The whole template: its nodes, and the errors found in it. */
  scan(): { nodes: TemplateNode[]; errors: TemplateSyntaxError[] } {
    const nodes: TemplateNode[] = [];
    for (;;) {
      nodes.push(...this.nodes());
      if (this.atEnd()) {
        return { nodes, errors: this.found };
      }
      // A closing tag with no element open: report it, and go on after it.
      this.found.push(this.error("closing tag with no element open"));
      this.resume(this.pos);
    }
  }

  /** Nodes up to a closing tag or the end. The closing tag is not consumed. */
  private nodes(): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    while (!this.atEnd() && !this.startsWith("</")) {
      const start = this.pos;
      try {
        nodes.push(...this.node());
      } catch (error) {
        // The node is dropped; scanning goes on at the next tag after the problem.
        this.found.push(asSyntaxError(error));
        this.resume(Math.max(this.pos, start));
      }
    }
    return nodes;
  }

  /** Moves to the next `<` after `from`, or to the end of the source. */
  private resume(from: number): void {
    const next = this.source.indexOf("<", from + 1);
    this.pos = next === -1 ? this.source.length : next;
  }

  /** One node, or none for a comment. */
  private node(): TemplateNode[] {
    if (this.startsWith("<!--")) {
      this.comment();
      return [];
    }
    if (this.startsWith("<!")) {
      throw this.error("only comments can start with <!");
    }
    if (this.matches(ELEMENT_START)) {
      return [this.element()];
    }
    return [this.text()];
  }

  private element(): ElementNode {
    const start = this.pos;
    this.pos += 1;
    const name = this.name();
    const { attributes, selfClosing } = this.startTagRest(start, name);
    if (selfClosing || VOID_ELEMENTS.has(name.toLowerCase())) {
      return { kind: "element", name, attributes, children: [], span: { start, end: this.pos } };
    }
    let children: TemplateNode[];
    const lower = name.toLowerCase();
    if (RAW_TEXT_ELEMENTS.has(lower) || ESCAPABLE_RAW_TEXT_ELEMENTS.has(lower)) {
      // The text ends at the element's own closing tag, which is the one to consume.
      children = this.rawText(name, ESCAPABLE_RAW_TEXT_ELEMENTS.has(lower));
      this.closingTag(name, start);
    } else {
      children = this.childrenOf(name, start);
    }
    return { kind: "element", name, attributes, children, span: { start, end: this.pos } };
  }

  /** The children of an element, up to its closing tag, which is consumed. */
  private childrenOf(name: string, start: number): TemplateNode[] {
    this.open.push(name);
    try {
      const children: TemplateNode[] = [];
      for (;;) {
        children.push(...this.nodes());
        if (this.closingTag(name, start)) {
          return children;
        }
      }
    } finally {
      this.open.pop();
    }
  }

  /** Text up to the next markup. `{{ }}` is skipped whole, so markup in it is not read. */
  private text(): TextNode {
    const start = this.pos;
    while (!this.atEnd() && !this.matches(MARKUP)) {
      this.pos = this.interpolationEnd()
        .getOrElse(this.pos + 1);
    }
    return {
      kind: "text",
      value: decodeHTML(this.source.slice(start, this.pos)),
      span: { start, end: this.pos },
    };
  }

  /** Where the `{{ }}` starting here ends, or none when there is none here. */
  private interpolationEnd(): Maybe<number> {
    const close = this.startsWith("{{") ? this.source.indexOf("}}", this.pos + 2) : -1;
    return Maybe.from(close === -1 ? undefined : close + 2);
  }

  /**
   * Everything up to the closing tag of a raw text element, as one text. Its references
   * are decoded when `decode` is set (`textarea`, `title`), and kept as written otherwise.
   */
  private rawText(name: string, decode: boolean): TemplateNode[] {
    const closing = new RegExp(`</${name}`, "gi");
    closing.lastIndex = this.pos;
    const match = closing.exec(this.source);
    const start = this.pos;
    const end = match?.index ?? this.source.length;
    const raw = this.source.slice(start, end);
    this.pos = end;
    const value = decode ? decodeHTML(raw) : raw;
    return value === "" ? [] : [{ kind: "text", value, span: { start, end } }];
  }

  /** Consumes `</name>`, which must close the element opened at `openedAt`. */
  /**
   * The closing tag of the element `name`, at the current position. True when the
   * element is closed by it (consumed), or when it is left unclosed for an enclosing
   * element (not consumed). False for a closing tag that closes nothing open: it is
   * reported and skipped, and the element goes on.
   */
  private closingTag(name: string, openedAt: number): boolean {
    if (this.atEnd()) {
      throw this.error(`<${name}> is never closed`, openedAt);
    }
    const at = this.pos;
    this.pos += 2;
    const closing = this.name();
    this.take(SPACES);
    this.expect(">");
    if (sameName(closing, name)) {
      return true;
    }
    if (this.open.some((open) => sameName(open, closing))) {
      this.found.push(this.error(`<${name}> is never closed`, openedAt));
      this.pos = at;
      return true;
    }
    this.found.push(this.error(`</${closing}> does not close <${name}>`, at));
    return false;
  }

  /** The attributes of a start tag, up to and including its `>` or `/>`. */
  private startTagRest(
    openedAt: number,
    name: string,
  ): { attributes: AttributeNode[]; selfClosing: boolean } {
    const attributes: AttributeNode[] = [];
    const names = new Set<string>();
    for (;;) {
      this.take(SPACES);
      if (this.atEnd()) {
        throw this.error(`<${name} is never closed`, openedAt);
      }
      if (this.consume(">")) {
        return { attributes, selfClosing: false };
      }
      if (this.consume("/>")) {
        return { attributes, selfClosing: true };
      }
      const at = this.pos;
      try {
        const attribute = this.attribute();
        if (names.has(attribute.name)) {
          this.found.push(this.error(`duplicate attribute ${attribute.name}`, at));
        } else {
          names.add(attribute.name);
          attributes.push(attribute);
        }
      } catch (error) {
        // The attribute is dropped, and the tag goes on at its end.
        this.found.push(asSyntaxError(error));
        this.skipToTagEnd();
      }
    }
  }

  /** Moves to the `>` that ends the start tag, or to the end of the source. */
  private skipToTagEnd(): void {
    const end = this.source.indexOf(">", this.pos);
    this.pos = end === -1 ? this.source.length : end;
  }

  /** `name`, `name=value`, or `name="value"` (or with single quotes). */
  private attribute(): AttributeNode {
    const name = this.take(ATTRIBUTE_NAME);
    if (name === "") {
      throw this.error("expected an attribute name");
    }
    this.take(SPACES);
    if (!this.consume("=")) {
      return { name, value: "" };
    }
    this.take(SPACES);
    return { name, value: this.attributeValue() };
  }

  private attributeValue(): string {
    const quote = this.source[this.pos];
    if (quote === "\"" || quote === "'") {
      const close = this.source.indexOf(quote, this.pos + 1);
      if (close === -1) {
        throw this.error("attribute value is never closed");
      }
      const value = this.source.slice(this.pos + 1, close);
      this.pos = close + 1;
      return decodeHTMLAttribute(value);
    }
    const value = this.take(UNQUOTED_VALUE);
    if (value === "") {
      throw this.error("expected an attribute value");
    }
    return decodeHTMLAttribute(value);
  }

  private comment(): void {
    const close = this.source.indexOf("-->", this.pos + 4);
    if (close === -1) {
      throw this.error("comment is never closed");
    }
    this.pos = close + 3;
  }

  private name(): string {
    const name = this.take(TAG_NAME);
    if (name === "") {
      throw this.error("expected an element name");
    }
    return name;
  }

  private expect(text: string): void {
    if (!this.consume(text)) {
      throw this.error(`expected ${text}`);
    }
  }

  /** Moves past `text` if the source is at it. */
  private consume(text: string): boolean {
    if (!this.startsWith(text)) {
      return false;
    }
    this.pos += text.length;
    return true;
  }

  /** Moves past what `pattern` matches here, and returns it (`""` for nothing). */
  private take(pattern: RegExp): string {
    pattern.lastIndex = this.pos;
    const match = pattern.exec(this.source);
    const text = match === null ? "" : match[0];
    this.pos += text.length;
    return text;
  }

  private matches(pattern: RegExp): boolean {
    pattern.lastIndex = this.pos;
    return pattern.test(this.source);
  }

  private startsWith(text: string): boolean {
    return this.source.startsWith(text, this.pos);
  }

  private atEnd(): boolean {
    return this.pos >= this.source.length;
  }

  /** An error at `at` (the current position by default), with its line and column. */
  private error(message: string, at = this.pos): TemplateSyntaxError {
    const line = this.source.slice(0, at)
      .split("\n").length;
    const column = at - this.source.lastIndexOf("\n", at - 1);
    return new TemplateSyntaxError(message, line, column);
  }
}

/** The error a scanner step threw. Anything else is a bug, and is rethrown. */
function asSyntaxError(error: unknown): TemplateSyntaxError {
  if (error instanceof TemplateSyntaxError) {
    return error;
  }
  throw error;
}

/** Whether two element names are the same: names are compared without their case. */
function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
