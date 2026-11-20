// Tinker's own template parser. It reads the markup of a template without a DOM,
// so it runs in Node as well as in the browser (the build step that compiles
// templates needs that).
//
// For a well-formed template it gives the same tree as BrowserTemplateParser.
// Where the browser guesses, this parser reports an error, or keeps what was written:
// - Names keep their case: `[ariaLabel]` stays `[ariaLabel]`.
// - Any element can be closed by `/>`, not only the HTML void elements (`<input>`,
//   `<br>`, ...), which need no closing tag.
// - Nothing is closed implicitly: `<p>` inside `<p>`, or a missing `</li>`, is an
//   error. A duplicate attribute is an error too, not silently dropped.
// - Text between `{{` and `}}` is not read as markup, so an expression can hold `<`.
//
// Errors are TemplateSyntaxError, with the line and column where the problem starts.
// Known limits (see IMPROVEMENTS.md): only a few named entities are decoded, `script`
// and `style` are read as raw text, and nodes carry no source positions.
// Comments are dropped.

import { Maybe } from "@tinker/functional";
import type { AttributeNode, ElementNode, TemplateNode, TextNode } from "./ast.ts";
import type { TemplateParser } from "./parser.ts";

/** A template that does not follow the syntax. `line` and `column` are 1-based. */
export class TemplateSyntaxError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(`${line}:${column}: ${message}`);
    this.name = "TemplateSyntaxError";
    this.line = line;
    this.column = column;
  }
}

/** Reads template source into Tinker's syntax tree (ast.ts). Throws TemplateSyntaxError. */
export class TinkerTemplateParser implements TemplateParser {
  parse(source: string): readonly TemplateNode[] {
    return new Scanner(source)
      .root();
  }
}

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);
/** Elements whose content is text, not markup, up to their closing tag. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);
const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", "\""],
  ["apos", "'"],
  ["nbsp", " "],
]);
const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;

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

  /** The whole template: its nodes, and nothing after them. */
  root(): TemplateNode[] {
    const nodes = this.nodes();
    if (!this.atEnd()) {
      throw this.error("closing tag with no element open");
    }
    return nodes;
  }

  /** Nodes up to a closing tag or the end. The closing tag is not consumed. */
  private nodes(): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    while (!this.atEnd() && !this.startsWith("</")) {
      nodes.push(...this.node());
    }
    return nodes;
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
      return { kind: "element", name, attributes, children: [] };
    }
    const children = RAW_TEXT_ELEMENTS.has(name.toLowerCase())
      ? this.rawText(name)
      : this.nodes();
    this.closeTag(name, start);
    return { kind: "element", name, attributes, children };
  }

  /** Text up to the next markup. `{{ }}` is skipped whole, so markup in it is not read. */
  private text(): TextNode {
    const start = this.pos;
    while (!this.atEnd() && !this.matches(MARKUP)) {
      this.pos = this.interpolationEnd()
        .getOrElse(this.pos + 1);
    }
    return { kind: "text", value: decodeEntities(this.source.slice(start, this.pos)) };
  }

  /** Where the `{{ }}` starting here ends, or none when there is none here. */
  private interpolationEnd(): Maybe<number> {
    const close = this.startsWith("{{") ? this.source.indexOf("}}", this.pos + 2) : -1;
    return Maybe.from(close === -1 ? undefined : close + 2);
  }

  /** Everything up to the closing tag of a raw text element, as one text. */
  private rawText(name: string): TemplateNode[] {
    const closing = new RegExp(`</${name}`, "gi");
    closing.lastIndex = this.pos;
    const match = closing.exec(this.source);
    const end = match?.index ?? this.source.length;
    const value = this.source.slice(this.pos, end);
    this.pos = end;
    return value === "" ? [] : [{ kind: "text", value }];
  }

  /** Consumes `</name>`, which must close the element opened at `openedAt`. */
  private closeTag(name: string, openedAt: number): void {
    if (this.atEnd()) {
      throw this.error(`<${name}> is never closed`, openedAt);
    }
    const at = this.pos;
    this.pos += 2;
    const closing = this.name();
    this.take(SPACES);
    this.expect(">");
    if (closing.toLowerCase() !== name.toLowerCase()) {
      throw this.error(`</${closing}> does not close <${name}>`, at);
    }
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
      const attribute = this.attribute();
      if (names.has(attribute.name)) {
        throw this.error(`duplicate attribute ${attribute.name}`, at);
      }
      names.add(attribute.name);
      attributes.push(attribute);
    }
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
      return decodeEntities(value);
    }
    const value = this.take(UNQUOTED_VALUE);
    if (value === "") {
      throw this.error("expected an attribute value");
    }
    return decodeEntities(value);
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

/** Replaces the references this parser knows; any other is left as written. */
function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole: string, body: string) =>
    decodeEntity(body)
      .getOrElse(whole));
}

/** The character a reference names: `&#65;`, `&#x41;` or a named one. None if unknown. */
function decodeEntity(body: string): Maybe<string> {
  if (!body.startsWith("#")) {
    return Maybe.from(NAMED_ENTITIES.get(body));
  }
  const hex = /^#x/i.test(body);
  const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  return Maybe.from(code <= 0x10ffff ? String.fromCodePoint(code) : undefined);
}
