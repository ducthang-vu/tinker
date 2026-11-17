// Compiling a template: the step after parsing, shared by all parsers (see
// ast.ts). It turns the raw tree into one the factory builds from directly,
// with the Tinker syntax already parsed: each text's `{{ }}` becomes an
// Interpolation, and each element lists the directives whose selector it
// matches (among those the component imports). Done once per component
// class; errors are reported here, before anything is rendered.
//
// Attributes are classified here too: plain ones, class bindings
// (`[class.done]="todo.done()"`) and input bindings (`[label]="name()"`,
// which set an input of the directives or component on the element), their
// expressions parsed. Other binding syntax (`[style.x]`, `[attr.x]`,
// `(event)`) is reported as not supported yet.

import type { AttributeNode, ElementNode, TemplateNode } from "./ast.ts";
import { type Expression, ExpressionParser } from "./expression.ts";
import { parseHandler } from "./handler.ts";
import { type EventModifier, parseEventName } from "./event-modifiers.ts";
import { Maybe } from "../../../functional/index.ts";
import type { Class } from "../../../utils/types.ts";
import { type Interpolation, parseInterpolation } from "./interpolation.ts";
import type { Selector } from "./selector.ts";
import { type BlockItem, type Item, itemsOf } from "./blocks.ts";
import { type Pattern, parsePattern, splitGuard } from "./pattern.ts";

/** A node of a compiled template. */
export type CompiledNode
  = | CompiledElement
    | CompiledText
    | CompiledSlot
    | CompiledLet
    | CompiledMatch
    | CompiledMap;

/**
 * A `@map`: its body is rendered once per item of `list`, in order. The item is
 * named `item` in the body; the body also reads `$index`, `$first`, `$last`,
 * `$even`, `$odd` and `$count`. `track` gives each item its identity (the
 * index, when there is none).
 */
export interface CompiledMap {
  readonly kind: "map";
  readonly list: Expression;
  readonly item: string;
  readonly track?: Expression;
  readonly body: readonly CompiledNode[];
}

/**
 * A `@match`, and so an `@if` (which is a match with one truthy case). The
 * first case whose pattern matches is shown; the default otherwise, if there is one.
 */
export interface CompiledMatch {
  readonly kind: "match";
  /** The value the cases test. Absent for a match of guards (`@match { @case _ when … }`). */
  readonly subject?: Expression;
  readonly cases: readonly CompiledCase[];
  readonly default?: readonly CompiledNode[];
}

/** A `@case`: its pattern, and what it shows. */
export interface CompiledCase {
  readonly pattern: Pattern;
  /** `when` condition: checked only once the pattern matched. */
  readonly guard?: Expression;
  readonly body: readonly CompiledNode[];
}

/**
 * What a case tests the subject against: `truthy` and `falsy` (JavaScript's
 * rules), `_` (anything), or a literal (compared with `===`).
 */

/**
 * A `@let name = expression;` in a template: it declares `name` for the
 * template's later bindings, and produces no DOM.
 */
export interface CompiledLet {
  readonly kind: "let";
  readonly name: string;
  readonly expression: Expression;
}

/**
 * A `<slot>` in a component's template: the content the component's user put
 * in its element, with `slot="name"` (or without one, for `name` = "").
 */
export interface CompiledSlot {
  readonly kind: "slot";
  readonly name: string;
}

export interface CompiledElement {
  readonly kind: "element";
  readonly name: string;
  /** Its plain attributes (not its bindings). */
  readonly attributes: readonly AttributeNode[];
  /** Its class bindings, e.g. `[class.done]="todo.done()"`, in template order. */
  readonly classBindings: readonly ClassBindingNode[];
  /** Its style bindings, e.g. `[style.color]="item().color"`, in template order. */
  readonly styleBindings: readonly ValueBindingNode[];
  /** Its attribute bindings, e.g. `[attr.title]="item().label"`, in template order. */
  readonly attributeBindings: readonly ValueBindingNode[];
  /** Its input bindings, e.g. `[label]="item().name"`, in template order. */
  readonly inputBindings: readonly InputBindingNode[];
  /** Its output bindings, e.g. `(selected)="choose($event)"`, in template order. */
  readonly outputBindings: readonly OutputBindingNode[];
  readonly children: readonly CompiledNode[];
  /** The directives matching this element (not its component), in import order. */
  readonly directives: readonly Class<object>[];
  /** The component matching this element, if any: the element is its host. */
  readonly component: Maybe<Class<object>>;
}

/** A style or attribute binding: `name` gets the value of `expression`. */
export interface ValueBindingNode {
  readonly name: string;
  readonly expression: Expression;
}

/** A class binding: class `name`, on while `expression` is truthy. */
export interface ClassBindingNode {
  readonly name: string;
  readonly expression: Expression;
}

/**
 * An input binding: the inputs `name` of the element's directives and
 * component get the value of `expression`.
 */
export interface InputBindingNode {
  readonly name: string;
  readonly expression: Expression;
}

/**
 * An event binding: the handler runs for each value of the outputs `name` of
 * the element's directives and component, and for each DOM event `name` on the
 * element (both, when both exist).
 */
export interface OutputBindingNode {
  /** The event (directive output and DOM event) name, without modifiers. */
  readonly name: string;
  /** The modifiers of the DOM event, e.g. `.prevent`. */
  readonly modifiers: readonly EventModifier[];
  readonly method: string;
  /** Whether the handler receives the value (`$event`) or nothing. */
  readonly passEvent: boolean;
}

/** A directive the template may use, and where it applies. */
export interface DirectiveCandidate {
  readonly type: Class<object>;
  readonly selector: Selector;
  /** A component: an element matches at most one, and becomes its host. */
  readonly isComponent: boolean;
}

/** Text, as static strings and the expressions between them. */
export interface CompiledText {
  readonly kind: "text";
  readonly interpolation: Interpolation;
}

/**
 * Compile parsed nodes, matching their elements against `candidates`.
 * Throws for the first invalid `{{ }}`, an element matching two components,
 * or content inside a component's element (projection is not supported yet).
 */
export function compileTemplate(
  nodes: readonly TemplateNode[],
  candidates: readonly DirectiveCandidate[] = [],
): readonly CompiledNode[] {
  return compileItems(itemsOf(nodes), candidates);
}

function compileItems(
  items: readonly Item[],
  candidates: readonly DirectiveCandidate[],
): CompiledNode[] {
  return items.flatMap((item) => {
    if ("keyword" in item) {
      return [compileBlock(item, candidates)];
    }
    return item.kind === "text" ? compileText(item.value) : [compileNode(item, candidates)];
  });
}

/** `@if` and `@else if` are a match with one truthy case; `@match` is a match with its cases. */
function compileBlock(
  block: BlockItem,
  candidates: readonly DirectiveCandidate[],
): CompiledMatch | CompiledMap {
  switch (block.keyword) {
    case "map":
      return compileMap(block, candidates);
    case "elseif":
      throw new Error("@else if must follow an @if");
    case "if":
      return {
        kind: "match",
        subject: condition(block),
        cases: [{ pattern: { kind: "truthy" }, body: compileItems(block.body, candidates) }],
        default: block.otherwise ? compileItems(block.otherwise, candidates) : undefined,
      };
    case "match": {
      const cases: CompiledCase[] = [];
      let fallback: readonly CompiledNode[] | undefined;
      for (const item of block.body) {
        if (!("keyword" in item)) {
          if (item.kind === "text" && item.value.trim() === "") {
            continue;
          }
          throw new Error("Only @case and @default blocks can be inside @match");
        }
        if (item.keyword === "case") {
          cases.push({ ...caseHeader(item, block.header === ""), body: compileItems(item.body, candidates) });
        } else if (item.keyword === "default") {
          if (fallback) {
            throw new Error("A @match has one @default");
          }
          fallback = compileItems(item.body, candidates);
        } else {
          throw new Error("Only @case and @default blocks can be inside @match");
        }
      }
      return {
        kind: "match",
        subject: block.header === "" ? undefined : expressionOf(block),
        cases,
        default: fallback,
      };
    }
    case "case":
      throw new Error("@case must be inside @match");
    case "default":
      throw new Error("@default must be inside @match");
    case "else":
      throw new Error("@else must follow an @if");
  }
}

/**
 * `@map list; let item` or `@map list; let item; track key`: the list, the name
 * of its items, and the optional identity of each item.
 */
function compileMap(block: BlockItem, candidates: readonly DirectiveCandidate[]): CompiledMap {
  const parts = block.header.split(";")
    .map((part) => part.trim());
  const [source, declaration, tracking] = parts;
  const declared = /^let\s+([A-Za-z_][\w]*)$/.exec(declaration ?? "");
  if (parts.length > 3 || source === undefined || !declared) {
    throw new Error(`@map needs a list and a name, e.g. @map todos; let todo`);
  }
  const tracked = tracking === undefined ? undefined : /^track\s+([\s\S]+)$/.exec(tracking);
  if (tracking !== undefined && !tracked) {
    throw new Error(`@map takes "track key" after the name, e.g. track todo.id, got "${tracking}"`);
  }
  return {
    kind: "map",
    list: expressionOf({ ...block, header: source }),
    item: declared![1]!,
    track: tracked ? expressionOf({ ...block, header: tracked[1]! }) : undefined,
    body: compileItems(block.body, candidates),
  };
}

/** The condition of an `@if`: an expression in parentheses. */
function condition(block: BlockItem): Expression {
  if (!block.header.startsWith("(") || !block.header.endsWith(")")) {
    throw new Error(`@${block.keyword} needs a condition in parentheses, e.g. @if (user())`);
  }
  return expressionOf({ ...block, header: block.header.slice(1, -1) });
}

function expressionOf(block: BlockItem): Expression {
  if (block.header === "") {
    throw new Error(`@${block.keyword} needs a value, e.g. @match state`);
  }
  return ExpressionParser.parse(block.header)
    .mapLeft((error) => new Error(`${error.message}, in @${block.keyword}`))
    .getOrThrow();
}

/**
 * A `@case`'s pattern and its optional `when` guard: `@case 1 when ok()`. A
 * match without a subject has only `_ when …` cases, since there is no value to test.
 */
function caseHeader(
  block: BlockItem,
  subjectless: boolean,
): { pattern: Pattern; guard?: Expression } {
  const split = splitGuard(block.header);
  if (split.pattern === "") {
    throw new Error("@case needs a pattern, e.g. @case \"loading\"");
  }
  const result = parsePattern(split.pattern)
    .mapLeft((error) => new Error(`${error.message}, in @case`))
    .getOrThrow();
  if (subjectless && result.kind !== "any") {
    throw new Error(`A @match without a subject takes "@case _ when …" cases, not "${split.pattern}"`);
  }
  const guard = split.guard === undefined
    ? undefined
    : expressionOf({ ...block, header: split.guard });
  return guard ? { pattern: result, guard } : { pattern: result };
}

/** A `@let` declaration in a text: `@let name = expression;`. */
const LET_DECLARATION = /@let\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/g;

/**
 * Compile a text: its `{{ }}` interpolation, and any `@let` declarations in
 * it, which become their own nodes. Whitespace between declarations is dropped.
 */
function compileText(value: string): CompiledNode[] {
  const declarations = [...value.matchAll(LET_DECLARATION)];
  if (declarations.length === 0) {
    return [{ kind: "text", interpolation: parseInterpolation(value)
      .getOrThrow() }];
  }
  const nodes: CompiledNode[] = [];
  let rest = 0;
  for (const declaration of declarations) {
    nodes.push(...textBefore(value.slice(rest, declaration.index!)));
    nodes.push(compileLet(declaration[1]!, declaration[2]!));
    rest = declaration.index! + declaration[0].length;
  }
  nodes.push(...textBefore(value.slice(rest)));
  return nodes;
}

function textBefore(text: string): CompiledNode[] {
  return text.trim() === "" ? [] : compileText(text);
}

function compileLet(name: string, source: string): CompiledLet {
  const expression = ExpressionParser.parse(source)
    .mapLeft((error) => new Error(`${error.message}, in @let ${name}`))
    .getOrThrow();
  return { kind: "let", name, expression };
}

function compileNode(node: ElementNode, candidates: readonly DirectiveCandidate[]): CompiledNode {
  if (node.name === "slot") {
    const name = node.attributes.find((attribute) => attribute.name === "name")?.value ?? "";
    return { kind: "slot", name };
  }
  const {
    attributes,
    classBindings,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
  } = classifyAttributes(node);
  const matched = candidates.filter((candidate) =>
    candidate.selector.matches({ name: node.name, attributes }));
  const components = matched.filter(({ isComponent }) => isComponent);
  if (components.length > 1) {
    const names = components.map(({ type }) => type.name)
      .join(", ");
    throw new Error(`<${node.name}> matches several components: ${names}`);
  }
  const component = Maybe.fromNullable(components[0]?.type);
  const directives = matched.filter(({ isComponent }) => !isComponent)
    .map(({ type }) => type);
  if (inputBindings.length > 0 && directives.length === 0 && component.isNone()) {
    throw new Error(
      `[${inputBindings[0]!.name}] on <${node.name}>: only inputs can be bound, `
      + "and no imported directive or component matches this element",
    );
  }
  return {
    kind: "element",
    name: node.name,
    attributes,
    classBindings,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
    // A component's element has content too: the component shows it in its `<slot>`s.
    children: compileTemplate(node.children, candidates),
    directives,
    component,
  };
}

const CLASS_BINDING = /^\[class\.([^\]\s]+)\]$/;
const INPUT_BINDING = /^\[([^\].\s]+)\]$/;
const OUTPUT_BINDING = /^\(([^)\s]+)\)$/;
const STYLE_BINDING = /^\[style\.([^\]\s]+)\]$/;
const ATTRIBUTE_BINDING = /^\[attr\.([^\]\s]+)\]$/;

/**
 * Split the attributes of `node` into plain attributes, class bindings and
 * input bindings (parsing their expressions). Throws for other binding
 * syntax, or an invalid expression.
 */
function classifyAttributes(node: ElementNode): {
  attributes: AttributeNode[];
  classBindings: ClassBindingNode[];
  inputBindings: InputBindingNode[];
  outputBindings: OutputBindingNode[];
  styleBindings: ValueBindingNode[];
  attributeBindings: ValueBindingNode[];
} {
  const attributes: AttributeNode[] = [];
  const classBindings: ClassBindingNode[] = [];
  const inputBindings: InputBindingNode[] = [];
  const outputBindings: OutputBindingNode[] = [];
  const styleBindings: ValueBindingNode[] = [];
  const attributeBindings: ValueBindingNode[] = [];
  const parse = (attribute: AttributeNode) => ExpressionParser.parse(attribute.value)
    .mapLeft((error) => new Error(`${error.message}, in ${attribute.name} on <${node.name}>`))
    .getOrThrow();
  for (const attribute of node.attributes) {
    const className = CLASS_BINDING.exec(attribute.name)?.[1];
    const inputName = INPUT_BINDING.exec(attribute.name)?.[1];
    const eventName = OUTPUT_BINDING.exec(attribute.name)?.[1];
    const styleName = STYLE_BINDING.exec(attribute.name)?.[1];
    const attrName = ATTRIBUTE_BINDING.exec(attribute.name)?.[1];
    if (styleName !== undefined) {
      styleBindings.push({ name: styleName, expression: parse(attribute) });
    } else if (attrName !== undefined) {
      attributeBindings.push({ name: attrName, expression: parse(attribute) });
    } else if (className !== undefined) {
      classBindings.push({ name: className, expression: parse(attribute) });
    } else if (inputName !== undefined) {
      inputBindings.push({ name: inputName, expression: parse(attribute) });
    } else if (eventName !== undefined) {
      const { event, modifiers } = parseEventName(eventName, "event binding")
        .mapLeft((error) => new Error(`${error.message}, on <${node.name}>`))
        .getOrThrow();
      const handler = parseHandler(attribute.value, "event handler")
        .mapLeft((error) =>
          new Error(`${error.message}, on <${node.name}>`))
        .getOrThrow();
      outputBindings.push({ name: event, modifiers, ...handler });
    } else if (/^[[(]/.test(attribute.name)) {
      throw new Error(`Bindings are not supported yet: "${attribute.name}" on <${node.name}>`);
    } else {
      attributes.push(attribute);
    }
  }
  return {
    attributes,
    classBindings,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
  };
}
