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

import type { AttributeNode, ElementNode, Span, TemplateNode } from "./ast.ts";
import { compileError, locatedAt, TemplateCompileError } from "./compile-error.ts";
import { type Expression, ExpressionParser } from "./expression.ts";
import { type Handler, parseHandler } from "./handler.ts";
import { type EventModifier, expandModifier, isModifier, parseEventName } from "./event-modifiers.ts";
import { Maybe } from "@tinker/functional";
import type { Class } from "../../../utils/types.ts";
import { type Interpolation, parseInterpolation } from "./interpolation.ts";
import type { Selector } from "./selector.ts";
import { type BlockItem, type Item, itemsOf } from "./blocks.ts";
import { namesOf, type Pattern, parsePattern, splitGuard } from "./pattern.ts";
import { isEventAttribute } from "../runtime/url-safety.ts";

/** A node of a compiled template. */
export type CompiledNode
  = | CompiledElement
    | CompiledText
    | CompiledSlot
    | CompiledLet
    | CompiledMatch
    | CompiledMap
    | CompiledDeclaration;

/**
 * A `<template #name>`: a template declared here, which renders nothing in place.
 * Its body is rendered by each instance, given by the template reference `name`.
 */
export interface CompiledDeclaration {
  readonly kind: "declaration";
  readonly name: string;
  /** The `let-` names its context gives: `<template #name let-item>` has `item`. */
  readonly names: readonly string[];
  readonly body: readonly CompiledNode[];
}

/**
 * A `@map`: its body is rendered once per item of `list`, in order. The item is
 * named `item` in the body; the body also reads `$index`, `$first`, `$last`,
 * `$even`, `$odd` and `$count`. `track` gives each item its identity (the
 * index, when there is none).
 */
export interface CompiledMap {
  readonly kind: "map";
  readonly list: Expression;
  /** What each item is matched with: a name, or a pattern that destructures it. */
  readonly item: Pattern;
  readonly track?: CompiledTrack;
  readonly body: readonly CompiledNode[];
}

/**
 * How a `@map` row is identified: by the value of an expression (`track item.id`),
 * or by the values of some fields of the item (`track { id, kind }`), which
 * match when each one is `===`.
 */
export type CompiledTrack
  = | { readonly kind: "value"; readonly expression: Expression }
    | { readonly kind: "fields"; readonly names: readonly string[] };

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
  /**
   * Its `[class]="{ name: condition }"` bindings: each name is a class, on while its
   * value is truthy. The expression is an object literal, or any object.
   */
  readonly classObjects: readonly ValueBindingNode[];
  /** Its style bindings, e.g. `[style.color]="item().color"`, in template order. */
  readonly styleBindings: readonly ValueBindingNode[];
  /** Its attribute bindings, e.g. `[attr.title]="item().label"`, in template order. */
  readonly attributeBindings: readonly ValueBindingNode[];
  /** Its input bindings, e.g. `[label]="item().name"`, in template order. */
  readonly inputBindings: readonly InputBindingNode[];
  /** Its output bindings, e.g. `(selected)="choose($event)"`, in template order. */
  readonly outputBindings: readonly OutputBindingNode[];
  readonly children: readonly CompiledNode[];
  /** The template references on it: `#name`, `#name="exportAs"` and `##name`. */
  readonly references: readonly TemplateReference[];
  /** The directives matching this element (not its component), in import order. */
  readonly directives: readonly Class<object>[];
  /** The component matching this element, if any: the element is its host. */
  readonly component: Maybe<Class<object>>;
  /**
   * Whether it is a `<tk-container>`: a position with no element. Its directives
   * and children are as on an element; it has only inputs, not host bindings.
   */
  readonly container: boolean;
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
  /** The selector of the directive or component it sets, for `[owner.name]`; none otherwise. */
  readonly owner?: string;
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
  /** The selector of the directive or component whose output it is, for `(owner.name)`. */
  readonly owner?: string;
  /** The modifiers of the DOM event, e.g. `.prevent`. */
  readonly modifiers: readonly EventModifier[];
  /** What the event does: a call of a component method, with `$event` available. */
  readonly handler: Handler;
  /**
   * For `(owner.enter)`, where `enter` is also a modifier: the DOM event `owner` with
   * that modifier, used unless `owner` has an output `enter`.
   */
  readonly domFallback?: DomFallback;
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
  return items.flatMap((item) => locatedAt(spanOf(item), () => {
    if ("keyword" in item) {
      return [compileBlock(item, candidates)];
    }
    return item.kind === "text" ? compileText(item.value) : [compileNode(item, candidates)];
  }));
}

/** The span of a text or element; a block has none. */
function spanOf(item: Item): Span | undefined {
  return "span" in item ? item.span : undefined;
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
  const declared = /^let\s+([\s\S]+)$/.exec(declaration ?? "");
  if (parts.length > 3 || source === undefined || !declared) {
    throw new Error(`@map needs a list and a name, e.g. @map todos; let todo`);
  }
  return {
    kind: "map",
    list: expressionOf({ ...block, header: source }),
    item: itemOf(declared![1]!.trim()),
    track: trackOf(block, tracking),
    body: compileItems(block.body, candidates),
  };
}

/** The `let` of a `@map`: a name, or a pattern that destructures each item. */
function itemOf(text: string): Pattern {
  const pattern = parsePattern(text)
    .mapLeft((error) => new Error(`${error.message}, in @map`))
    .match({
      left: (error) => {
        throw error;
      },
      right: (value) => value,
    });
  if (!isMapPattern(pattern)) {
    throw new Error(`@map's let takes a name or a pattern, e.g. let todo or let { id }, got "${text}"`);
  }
  const reserved = namesOf(pattern)
    .find((name) => name.startsWith("$"));
  if (reserved !== undefined) {
    throw new Error(`"${reserved}" is reserved: names starting with $ are the row's variables`);
  }
  return pattern;
}

function isMapPattern(pattern: Pattern): boolean {
  if (pattern.kind === "as") {
    return isMapPattern(pattern.pattern);
  }
  return pattern.kind === "bind" || pattern.kind === "object" || pattern.kind === "array";
}

/** The `track` after a `@map`'s name: an expression, or `{ field, … }` naming fields. */
function trackOf(block: BlockItem, tracking: string | undefined): CompiledTrack | undefined {
  if (tracking === undefined) {
    return undefined;
  }
  const tracked = /^track\s+([\s\S]+)$/.exec(tracking);
  if (!tracked) {
    throw new Error(`@map takes "track key" after the name, e.g. track todo.id, got "${tracking}"`);
  }
  const text = tracked[1]!.trim();
  if (text.startsWith("{")) {
    return { kind: "fields", names: fieldNamesOf(text) };
  }
  return { kind: "value", expression: expressionOf({ ...block, header: text }) };
}

/** The names in `{ id, kind }`: each one a plain name, none twice. */
function fieldNamesOf(text: string): string[] {
  const inner = text.endsWith("}") ? text.slice(1, -1) : undefined;
  const names = inner?.split(",")
    .map((name) => name.trim());
  if (names === undefined || names.some((name) => !/^[A-Za-z_$][\w$]*$/.test(name))) {
    throw new Error(`@map's track { } takes field names, e.g. track { id, kind }, got "${text}"`);
  }
  if (new Set(names).size !== names.length) {
    throw new Error(`@map's track names a field twice: "${text}"`);
  }
  return names;
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
    .match({
      left: (error) => {
        throw error;
      },
      right: (value) => value,
    });
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
    .match({
      left: (error) => {
        throw error;
      },
      right: (value) => value,
    });
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
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }) }];
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
    .match({
      left: (error) => {
        throw error;
      },
      right: (value) => value,
    });
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
    classObjects,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
    references,
  } = classifyAttributes(node);
  const bound = [classBindings, classObjects, styleBindings, attributeBindings, inputBindings,
    outputBindings]
    .some((list) => list.length > 0);
  if (node.name === "template" && !bound && references.length === 1
    && references[0]!.target.kind === "element") {
    return declarationOf(node, references[0]!.name, candidates);
  }
  const matched = candidates.filter((candidate) =>
    candidate.selector.matches({
      name: node.name,
      // An input binding counts as an attribute of its name, as in Angular:
      // [outlet] matches an [outlet] selector.
      attributes: [...attributes, ...inputBindings.map(({ name }) => ({ name, value: "" }))],
    }));
  const components = matched.filter(({ isComponent }) => isComponent);
  if (components.length > 1) {
    const names = components.map(({ type }) => type.name)
      .join(", ");
    throw new Error(`<${node.name}> matches several components: ${names}`);
  }
  const component = Maybe.from(components[0]?.type);
  const directives = matched.filter(({ isComponent }) => !isComponent)
    .map(({ type }) => type);
  const container = node.name === CONTAINER;
  if (container) {
    checkContainer(node, {
      classBindings,
      classObjects,
      styleBindings,
      attributeBindings,
      outputBindings,
      component,
      references,
    });
  }
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
    classObjects,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
    // A component's element has content too: the component shows it in its `<slot>`s.
    children: compileTemplate(node.children, candidates),
    references,
    directives,
    component,
    container,
  };
}

/** The element name of a container: a position with no element, for directives. */
const CONTAINER = "tk-container";

/** A container has no element, so only inputs and directives can be on it. */
function checkContainer(
  node: ElementNode,
  on: {
    readonly classBindings: readonly ClassBindingNode[];
    readonly classObjects: readonly ValueBindingNode[];
    readonly styleBindings: readonly ValueBindingNode[];
    readonly attributeBindings: readonly ValueBindingNode[];
    readonly outputBindings: readonly OutputBindingNode[];
    readonly component: Maybe<Class<object>>;
    readonly references: readonly TemplateReference[];
  },
): void {
  const bound = [
    ...on.classBindings.map(({ name }) => `[class.${name}]`),
    ...on.classObjects.map(() => "[class]"),
    ...on.styleBindings.map(({ name }) => `[style.${name}]`),
    ...on.attributeBindings.map(({ name }) => `[attr.${name}]`),
    ...on.outputBindings.map(({ name }) => `(${name})`),
  ][0];
  if (bound !== undefined) {
    throw new Error(`${bound} on <${node.name}>: a container has no element, so only inputs and directives can be on it`);
  }
  if (on.component.isSome()) {
    throw new Error(`<${node.name}> cannot hold a component: it has no element`);
  }
  const named = on.references.find(({ target }) => target.kind === "element");
  if (named !== undefined) {
    throw new Error(`#${named.name} on <${node.name}>: a container has no element to name`);
  }
}

/** A `<template #name>`: its body, and the `let-` names its context gives. */
function declarationOf(
  node: ElementNode,
  name: string,
  candidates: readonly DirectiveCandidate[],
): CompiledDeclaration {
  const names = node.attributes
    .filter((attribute) => attribute.name.startsWith("let-"))
    .map((attribute) => attribute.name.slice("let-".length));
  const reserved = names.find((letName) => letName.startsWith("$"));
  if (reserved !== undefined) {
    throw new Error(`"let-${reserved}" on <template #${name}>: names starting with $ are the framework's`);
  }
  const invalid = names.find((letName) => !/^[A-Za-z_][\w$]*$/.test(letName));
  if (invalid !== undefined) {
    throw new Error(`"let-${invalid}" on <template #${name}> is not a name`);
  }
  return { kind: "declaration", name, names, body: compileTemplate(node.children, candidates) };
}

/**
 * An event name may start with the selector that owns the output: `(abc.fired)`.
 * A leading name is an owner unless it is a modifier, as in `(click.prevent)`.
 */
function splitOwner(text: string | undefined): {
  owner?: string;
  rest?: string;
  domFallback?: DomFallback;
} {
  if (text === undefined) {
    return {};
  }
  const [first, ...more] = text.split(".");
  const [second] = more;
  if (more.length === 1 && second !== undefined && isModifier(second)) {
    // `pick.enter`: the output `enter` of `pick`, or the DOM event `pick` with `.enter`.
    return {
      owner: first,
      rest: second,
      domFallback: { event: first!, modifiers: expandModifier(second) },
    };
  }
  if (more.length > 0 && !isModifier(more[0]!)) {
    return { owner: first, rest: more.join(".") };
  }
  return { rest: text };
}

/** The DOM event an ambiguous `(owner.modifier)` means when `owner` has no such output. */
export interface DomFallback {
  readonly event: string;
  readonly modifiers: readonly EventModifier[];
}

const CLASS_BINDING = /^\[class\.([^\]\s]+)\]$/;
const INPUT_BINDING = /^\[(?:([^\].\s]+)\.)?([^\].\s]+)\]$/;
const OUTPUT_BINDING = /^\(([^)\s]+)\)$/;
const STYLE_BINDING = /^\[style\.([^\]\s]+)\]$/;
const ATTRIBUTE_BINDING = /^\[attr\.([^\]\s]+)\]$/;

/**
 * Split the attributes of `node` into plain attributes, class bindings and
 * input bindings (parsing their expressions). Throws for other binding
 * syntax, or an invalid expression.
 */
function classifyAttributes(node: ElementNode): {
  references: TemplateReference[];
  attributes: AttributeNode[];
  classBindings: ClassBindingNode[];
  classObjects: ValueBindingNode[];
  inputBindings: InputBindingNode[];
  outputBindings: OutputBindingNode[];
  styleBindings: ValueBindingNode[];
  attributeBindings: ValueBindingNode[];
} {
  const attributes: AttributeNode[] = [];
  const references: TemplateReference[] = [];
  const classBindings: ClassBindingNode[] = [];
  const classObjects: ValueBindingNode[] = [];
  const inputBindings: InputBindingNode[] = [];
  const outputBindings: OutputBindingNode[] = [];
  const styleBindings: ValueBindingNode[] = [];
  const attributeBindings: ValueBindingNode[] = [];
  const parse = (attribute: AttributeNode) => ExpressionParser.parse(attribute.value)
    .mapLeft((error) => new Error(`${error.message}, in ${attribute.name} on <${node.name}>`))
    .match({
      left: (error) => {
        throw error;
      },
      right: (value) => value,
    });
  for (const attribute of node.attributes) {
    if (attribute.name === "[class]") {
      classObjects.push({ name: "", expression: parse(attribute) });
      continue;
    }
    if (attribute.name.startsWith("#")) {
      references.push(referenceOf(attribute, node, references));
      continue;
    }
    const className = CLASS_BINDING.exec(attribute.name)?.[1];
    const input = INPUT_BINDING.exec(attribute.name);
    const inputName = input?.[2];
    const inputOwner = input?.[1];
    const output = OUTPUT_BINDING.exec(attribute.name)?.[1];
    const { owner: outputOwner, rest: eventName, domFallback } = splitOwner(output);
    const styleName = STYLE_BINDING.exec(attribute.name)?.[1];
    const attrName = ATTRIBUTE_BINDING.exec(attribute.name)?.[1];
    if (styleName !== undefined) {
      styleBindings.push({ name: styleName, expression: parse(attribute) });
    } else if (attrName !== undefined) {
      if (isEventAttribute(attrName)) {
        throw new Error(
          `[attr.${attrName}] on <${node.name}>: event attributes cannot be bound; use (${attrName.slice(2)}) instead`,
        );
      }
      attributeBindings.push({ name: attrName, expression: parse(attribute) });
    } else if (className !== undefined) {
      classBindings.push({ name: className, expression: parse(attribute) });
    } else if (inputName !== undefined) {
      inputBindings.push({ name: inputName, owner: inputOwner, expression: parse(attribute) });
    } else if (eventName !== undefined) {
      const { event, modifiers } = parseEventName(eventName, "event binding")
        .mapLeft((error) => new Error(`${error.message}, on <${node.name}>`))
        .match({
          left: (error) => {
            throw error;
          },
          right: (value) => value,
        });
      const handler = parseHandler(attribute.value, "event handler")
        .mapLeft((error) =>
          new Error(`${error.message}, on <${node.name}>`))
        .match({
          left: (error) => {
            throw error;
          },
          right: (value) => value,
        });
      outputBindings.push({
        name: event,
        owner: outputOwner,
        modifiers,
        handler,
        ...(domFallback && { domFallback }),
      });
    } else if (/^[[(]/.test(attribute.name)) {
      throw new Error(`Bindings are not supported yet: "${attribute.name}" on <${node.name}>`);
    } else {
      attributes.push(attribute);
    }
  }
  return {
    references,
    attributes,
    classBindings,
    classObjects,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
  };
}

/** A template reference: a name for the element, for a directive on it, or for its component. */
export interface TemplateReference {
  readonly name: string;
  /**
   * `element` for `#name`, `export` for `#name="exportAs"` (the directive, or the
   * component, with that exportAs), `component` for `##name` (its component).
   */
  readonly target:
    | { readonly kind: "element" }
    | { readonly kind: "export"; readonly exportAs: string }
    | { readonly kind: "component" };
}

const REFERENCE_NAME = /^[A-Za-z_$][\w$]*$/;

/**
 * The template reference an attribute `#name`, `#name="exportAs"` or `##name`
 * declares. The name must be a plain name, declared once on its element.
 */
function referenceOf(
  attribute: AttributeNode,
  node: ElementNode,
  declared: readonly TemplateReference[],
): TemplateReference {
  const component = attribute.name.startsWith("##");
  const name = attribute.name.slice(component ? 2 : 1);
  if (!REFERENCE_NAME.test(name)) {
    throw new Error(`"${attribute.name}" is not a template reference on <${node.name}>`);
  }
  if (declared.some((reference) => reference.name === name)) {
    throw new Error(`#${name} is declared twice on <${node.name}>`);
  }
  if (component) {
    if (attribute.value !== "") {
      throw new Error(`"${attribute.name}" on <${node.name}> takes no value`);
    }
    return { name, target: { kind: "component" } };
  }
  if (attribute.value === "") {
    return { name, target: { kind: "element" } };
  }
  if (!REFERENCE_NAME.test(attribute.value)) {
    throw new Error(`"${attribute.value}" is not an exportAs name on <${node.name}>`);
  }
  return { name, target: { kind: "export", exportAs: attribute.value } };
}
