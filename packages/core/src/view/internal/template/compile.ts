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
import { located, type Parsed } from "./compile-error.ts";
import { type Expression, ExpressionParser } from "./expression.ts";
import { type Handler, parseHandler } from "./handler.ts";
import { type EventModifier, expandModifier, isModifier, parseEventName } from "./event-modifiers.ts";
import { flatMap, Left, map, mapLeft, Right, sequence, fromNullable, isSome, isNone, match, use, type Maybe } from "@tinker/functional/v1";
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
  /** The name `#name="exportAs"` gives it, if it has one. */
  readonly exportAs?: string;
}

/** Text, as static strings and the expressions between them. */
export interface CompiledText {
  readonly kind: "text";
  readonly interpolation: Interpolation;
}

/**
 * Compile parsed nodes, matching their elements against `candidates`. The first invalid `{{ }}`,
 * an element matching two components, or content inside a component's element (projection is
 * not supported yet) is the error.
 */
export function compileTemplate(
  nodes: readonly TemplateNode[],
  candidates: readonly DirectiveCandidate[] = [],
): Parsed<readonly CompiledNode[]> {
  return flatMap(itemsOf(nodes), (items) => compiledOnce(items, candidates));
}

/** The compiled items, if each name is declared once where it is seen. */
function compiledOnce(
  items: readonly Item[],
  candidates: readonly DirectiveCandidate[],
): Parsed<readonly CompiledNode[]> {
  return flatMap(compileItems(items, candidates), (compiled) => uniqueNames(compiled));
}

/** `compiled`, if its names are each declared once. */
function uniqueNames(compiled: readonly CompiledNode[]): Parsed<readonly CompiledNode[]> {
  return map(declaredOnce(compiled, new Set()), () => compiled);
}

/**
 * Each name declared by `#name`, `##name` or `<template #name>` is declared once, in the
 * order the builder sees them. An element's names are visible to what follows it in its
 * scope, and its children share that scope. A `@match`, a `@map` or a template sees a copy
 * and leaves nothing behind. A `@let` adds its name without a check, as the builder does.
 */
function declaredOnce(
  nodes: readonly CompiledNode[],
  visible: ReadonlySet<string>,
): Parsed<ReadonlySet<string>> {
  return nodes.reduce<Parsed<ReadonlySet<string>>>((done, node) =>
    flatMap(done, (names) => declaredByNode(node, names)), Right.of(visible));
}

function declaredByNode(
  node: CompiledNode,
  names: ReadonlySet<string>,
): Parsed<ReadonlySet<string>> {
  if (node.kind === "element") {
    return declaredByElement(node, names);
  }
  if (node.kind === "let") {
    return Right.of(new Set([...names, node.name]));
  }
  if (node.kind === "declaration") {
    return flatMap(declare(node.name, names), (declared) => declaredWithin(node.body, declared));
  }
  if (node.kind === "match") {
    const branches = [
      ...node.cases.map((branch) => branch.body),
      ...(node.default ? [node.default] : []),
    ];
    return map(sequence(branches.map((body) => copyOf(body, names))), () => names);
  }
  if (node.kind === "map") {
    return map(copyOf(node.body, names), () => names);
  }
  return Right.of(names);
}

/** The names an element declares, then those its children declare after them, in its scope. */
function declaredByElement(
  node: CompiledElement,
  names: ReadonlySet<string>,
): Parsed<ReadonlySet<string>> {
  return flatMap(declaredByReferences(node.references, names), (declared) =>
    declaredOnce(node.children, declared));
}

function declaredByReferences(
  references: readonly TemplateReference[],
  names: ReadonlySet<string>,
): Parsed<ReadonlySet<string>> {
  return references.reduce<Parsed<ReadonlySet<string>>>((done, reference) =>
    flatMap(done, (declared) => declare(reference.name, declared)), Right.of(names));
}

/** `names` with `name` added, or an error if `name` is already declared. */
function declare(name: string, names: ReadonlySet<string>): Parsed<ReadonlySet<string>> {
  return names.has(name)
    ? Left.of(new Error(`#${name} is already declared in this template`))
    : Right.of(new Set([...names, name]));
}

/** The names a template's body declares, from the names visible to it; `declared` is kept. */
function declaredWithin(
  body: readonly CompiledNode[],
  declared: ReadonlySet<string>,
): Parsed<ReadonlySet<string>> {
  return map(declaredOnce(body, declared), () => declared);
}

/** The names a copy of the scope declares in `body`: nothing is left behind. */
function copyOf(body: readonly CompiledNode[], names: ReadonlySet<string>): Parsed<void> {
  return map(declaredOnce(body, names), () => undefined);
}

/** Concatenates the nodes of each item, in order: the first failure is the result. */
function compileItems(
  items: readonly Item[],
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledNode[]> {
  return concatAll(items.map((item) => compileItem(item, candidates)));
}

/** The nodes of a list of results, in order: the first failure is the result. */
function concatAll(results: readonly Parsed<readonly CompiledNode[]>[]): Parsed<CompiledNode[]> {
  return map(sequence(results), (lists) => lists.flat());
}

/** One item, compiled. An error gets the item's span, unless an inner item gave it one. */
function compileItem(
  item: Item,
  candidates: readonly DirectiveCandidate[],
): Parsed<readonly CompiledNode[]> {
  const compiled: Parsed<readonly CompiledNode[]> = "keyword" in item
    ? map(compileBlock(item, candidates), (block): readonly CompiledNode[] => [block])
    : item.kind === "text"
      ? compileText(item.value)
      : map(compileNode(item, candidates), (node): readonly CompiledNode[] => [node]);
  return mapLeft(compiled, (error) => located(error, spanOf(item)));
}

/** The span of a text or element; a block has none. */
function spanOf(item: Item): Span | undefined {
  return "span" in item ? item.span : undefined;
}

/** `@if` and `@else if` are a match with one truthy case; `@match` is a match with its cases. */
function compileBlock(
  block: BlockItem,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledMatch | CompiledMap> {
  switch (block.keyword) {
    case "map":
      return compileMap(block, candidates);
    case "elseif":
      return Left.of(new Error("@else if must follow an @if"));
    case "if":
      return flatMap(condition(block), (subject) => truthyMatch(subject, block, candidates));
    case "match":
      return flatMap(armsOf(block, candidates), (arms) => matchOf(arms, block));
    case "case":
      return Left.of(new Error("@case must be inside @match"));
    case "default":
      return Left.of(new Error("@default must be inside @match"));
    case "else":
      return Left.of(new Error("@else must follow an @if"));
  }
}

/** The compiled items of an optional body: none when there is no body. */
function optionalItems(
  items: readonly Item[] | undefined,
  candidates: readonly DirectiveCandidate[],
): Parsed<readonly CompiledNode[] | undefined> {
  return items === undefined ? Right.of(undefined) : compileItems(items, candidates);
}

/** The subject of a `@match`: none for a match of guards (`@match { … }`). */
function optionalSubject(block: BlockItem): Parsed<Expression | undefined> {
  return block.header === "" ? Right.of(undefined) : expressionOf(block);
}

/** The cases and the default of a `@match`, from its body. */
interface Arms {
  readonly cases: readonly CompiledCase[];
  readonly fallback?: readonly CompiledNode[];
}

function armsOf(block: BlockItem, candidates: readonly DirectiveCandidate[]): Parsed<Arms> {
  return block.body.reduce<Parsed<Arms>>(
    (arms, item) => flatMap(arms, (current) => armOf(item, current, block, candidates)),
    Right.of<Arms, Error>({ cases: [] }),
  );
}

/** One item of a `@match`'s body added to its arms: a `@case`, a `@default`, or whitespace. */
function armOf(
  item: Item,
  current: Arms,
  block: BlockItem,
  candidates: readonly DirectiveCandidate[],
): Parsed<Arms> {
  if (!("keyword" in item)) {
    if (item.kind === "text" && item.value.trim() === "") {
      return Right.of(current);
    }
    return Left.of(new Error("Only @case and @default blocks can be inside @match"));
  }
  if (item.keyword === "case") {
    return flatMap(caseHeader(item, block.header === ""), (header) =>
      caseArm(header, item, current, candidates));
  }
  if (item.keyword === "default") {
    if (current.fallback) {
      return Left.of(new Error("A @match has one @default"));
    }
    return map(compileItems(item.body, candidates), (body): Arms => ({
      ...current,
      fallback: body,
    }));
  }
  return Left.of(new Error("Only @case and @default blocks can be inside @match"));
}

/**
 * `@map list; let item` or `@map list; let item; track key`: the list, the name
 * of its items, and the optional identity of each item.
 */
function compileMap(
  block: BlockItem,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledMap> {
  const parts = block.header.split(";")
    .map((part) => part.trim());
  const [source, declaration, tracking] = parts;
  const declared = /^let\s+([\s\S]+)$/.exec(declaration ?? "");
  if (parts.length > 3 || source === undefined || !declared) {
    return Left.of(new Error(`@map needs a list and a name, e.g. @map todos; let todo`));
  }
  return flatMap(expressionOf({ ...block, header: source }), (list) =>
    mapOfList(list, block, declared[1]!.trim(), tracking, candidates));
}

/** The `let` of a `@map`: a name, or a pattern that destructures each item. */
function itemOf(text: string): Parsed<Pattern> {
  return flatMap(mapLeft(parsePattern(text), (error) => new Error(`${error.message}, in @map`)),
    (pattern): Parsed<Pattern> => {
      if (!isMapPattern(pattern)) {
        return Left.of(new Error(`@map's let takes a name or a pattern, e.g. let todo or let { id }, got "${text}"`));
      }
      const reserved = namesOf(pattern)
        .find((name) => name.startsWith("$"));
      if (reserved !== undefined) {
        return Left.of(new Error(`"${reserved}" is reserved: names starting with $ are the row's variables`));
      }
      return Right.of(pattern);
    });
}

function isMapPattern(pattern: Pattern): boolean {
  if (pattern.kind === "as") {
    return isMapPattern(pattern.pattern);
  }
  return pattern.kind === "bind" || pattern.kind === "object" || pattern.kind === "array";
}

/** The `track` after a `@map`'s name: an expression, or `{ field, … }` naming fields. */
function trackOf(
  block: BlockItem,
  tracking: string | undefined,
): Parsed<CompiledTrack | undefined> {
  if (tracking === undefined) {
    return Right.of(undefined);
  }
  const tracked = /^track\s+([\s\S]+)$/.exec(tracking);
  if (!tracked) {
    return Left.of(new Error(`@map takes "track key" after the name, e.g. track todo.id, got "${tracking}"`));
  }
  const text = tracked[1]!.trim();
  if (text.startsWith("{")) {
    return map(fieldNamesOf(text), (names): CompiledTrack => ({ kind: "fields", names }));
  }
  return map(expressionOf({ ...block, header: text }), (expression): CompiledTrack => ({
    kind: "value",
    expression,
  }));
}

/** The names in `{ id, kind }`: each one a plain name, none twice. */
function fieldNamesOf(text: string): Parsed<string[]> {
  const inner = text.endsWith("}") ? text.slice(1, -1) : undefined;
  const names = inner?.split(",")
    .map((name) => name.trim());
  if (names === undefined || names.some((name) => !/^[A-Za-z_$][\w$]*$/.test(name))) {
    return Left.of(new Error(`@map's track { } takes field names, e.g. track { id, kind }, got "${text}"`));
  }
  if (new Set(names).size !== names.length) {
    return Left.of(new Error(`@map's track names a field twice: "${text}"`));
  }
  return Right.of(names);
}

/** The condition of an `@if`: an expression in parentheses. */
function condition(block: BlockItem): Parsed<Expression> {
  if (!block.header.startsWith("(") || !block.header.endsWith(")")) {
    return Left.of(new Error(`@${block.keyword} needs a condition in parentheses, e.g. @if (user())`));
  }
  return expressionOf({ ...block, header: block.header.slice(1, -1) });
}

function expressionOf(block: BlockItem): Parsed<Expression> {
  if (block.header === "") {
    return Left.of(new Error(`@${block.keyword} needs a value, e.g. @match state`));
  }
  return mapLeft(ExpressionParser.parse(block.header), (error) =>
    new Error(`${error.message}, in @${block.keyword}`));
}

/**
 * A `@case`'s pattern and its optional `when` guard: `@case 1 when ok()`. A
 * match without a subject has only `_ when …` cases, since there is no value to test.
 */
function caseHeader(
  block: BlockItem,
  subjectless: boolean,
): Parsed<{ pattern: Pattern; guard?: Expression }> {
  const split = splitGuard(block.header);
  if (split.pattern === "") {
    return Left.of(new Error("@case needs a pattern, e.g. @case \"loading\""));
  }
  return flatMap(mapLeft(parsePattern(split.pattern), (error) => new Error(`${error.message}, in @case`)),
    (result): Parsed<{ pattern: Pattern; guard?: Expression }> => {
      if (subjectless && result.kind !== "any") {
        return Left.of(new Error(`A @match without a subject takes "@case _ when …" cases, not "${split.pattern}"`));
      }
      return guardedHeader(result, block, split.guard);
    });
}

/** The guard of a `@case`, when it has one. */
function optionalGuard(
  block: BlockItem,
  guard: string | undefined,
): Parsed<Expression | undefined> {
  return guard === undefined ? Right.of(undefined) : expressionOf({ ...block, header: guard });
}

/** A `@let` declaration in a text: `@let name = expression;`. */
const LET_DECLARATION = /@let\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/g;

/**
 * Compile a text: its `{{ }}` interpolation, and any `@let` declarations in
 * it, which become their own nodes. Whitespace between declarations is dropped.
 */
function compileText(value: string): Parsed<readonly CompiledNode[]> {
  const declarations = [...value.matchAll(LET_DECLARATION)];
  if (declarations.length === 0) {
    return map(parseInterpolation(value), (interpolation): CompiledNode[] => [{ kind: "text", interpolation }]);
  }
  const parts: Parsed<readonly CompiledNode[]>[] = [];
  let rest = 0;
  for (const declaration of declarations) {
    parts.push(textBefore(value.slice(rest, declaration.index!)));
    parts.push(map(compileLet(declaration[1]!, declaration[2]!), (node): CompiledNode[] => [node]));
    rest = declaration.index! + declaration[0].length;
  }
  parts.push(textBefore(value.slice(rest)));
  return concatAll(parts);
}

function textBefore(text: string): Parsed<readonly CompiledNode[]> {
  return text.trim() === "" ? Right.of([]) : compileText(text);
}

function compileLet(name: string, source: string): Parsed<CompiledLet> {
  return map(
    mapLeft(ExpressionParser.parse(source), (error) => new Error(`${error.message}, in @let ${name}`)),
    (expression): CompiledLet => ({ kind: "let", name, expression }),
  );
}

function compileNode(
  node: ElementNode,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledNode> {
  if (node.name === "slot") {
    const name = node.attributes.find((attribute) => attribute.name === "name")?.value ?? "";
    return Right.of<CompiledNode, Error>({ kind: "slot", name });
  }
  return flatMap(classifyAttributes(node), (classified) =>
    compileElement(node, classified, candidates));
}

/** The compiled element, from its classified attributes. */
function compileElement(
  node: ElementNode,
  classified: Classified,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledNode> {
  const {
    attributes,
    classBindings,
    classObjects,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
    references,
  } = classified;
  const bound = [classBindings, classObjects, styleBindings, attributeBindings, inputBindings,
    outputBindings]
    .some((list) => list.length > 0);
  if (node.name === "template" && !bound && references.length === 1
    && references[0]!.target.kind === "element") {
    return map(
      declarationOf(node, references[0]!.name, candidates),
      (declaration): CompiledNode => declaration,
    );
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
    return Left.of(new Error(`<${node.name}> matches several components: ${names}`));
  }
  const component = fromNullable(components[0]?.type);
  const directives = matched.filter(({ isComponent }) => !isComponent)
    .map(({ type }) => type);
  const container = node.name === CONTAINER;
  const containerChecked = container
    ? checkContainer(node, {
        classBindings,
        classObjects,
        styleBindings,
        attributeBindings,
        outputBindings,
        component,
        references,
      })
    : Right.of<void, Error>(undefined);
  const referencesChecked = checkedReferences(node, references, matched, component);
  const checked = flatMap(containerChecked, () => referencesChecked);
  const parts: ElementParts = {
    attributes,
    classBindings,
    classObjects,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
    references,
    directives,
    component,
    container,
  };
  return flatMap(checked, () => elementAfterChecks(node, parts, candidates));
}

/**
 * The references of an element against what it matched: `##name` needs the element's
 * component, and `#name="exportAs"` needs a directive or component with that exportAs.
 */
function checkedReferences(
  node: ElementNode,
  references: readonly TemplateReference[],
  matched: readonly DirectiveCandidate[],
  component: Maybe<Class<object>>,
): Parsed<void> {
  return references.reduce<Parsed<void>>((done, reference) =>
    flatMap(done, () => referenceChecked(node, reference, matched, component)),
  Right.of<void, Error>(undefined));
}

function referenceChecked(
  node: ElementNode,
  reference: TemplateReference,
  matched: readonly DirectiveCandidate[],
  component: Maybe<Class<object>>,
): Parsed<void> {
  const { name, target } = reference;
  if (target.kind === "component" && isNone(component)) {
    return Left.of(new Error(`##${name}: <${node.name}> has no component`));
  }
  if (target.kind === "export" && !matched.some((candidate) => candidate.exportAs === target.exportAs)) {
    return Left.of(new Error(
      `#${name}="${target.exportAs}": no directive on <${node.name}> is exported as "${target.exportAs}"`,
    ));
  }
  return Right.of<void, Error>(undefined);
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
): Parsed<void> {
  const bound = [
    ...on.classBindings.map(({ name }) => `[class.${name}]`),
    ...on.classObjects.map(() => "[class]"),
    ...on.styleBindings.map(({ name }) => `[style.${name}]`),
    ...on.attributeBindings.map(({ name }) => `[attr.${name}]`),
    ...on.outputBindings.map(({ name }) => `(${name})`),
  ][0];
  if (bound !== undefined) {
    return Left.of(new Error(`${bound} on <${node.name}>: a container has no element, so only inputs and directives can be on it`));
  }
  if (isSome(on.component)) {
    return Left.of(new Error(`<${node.name}> cannot hold a component: it has no element`));
  }
  const named = on.references.find(({ target }) => target.kind === "element");
  if (named !== undefined) {
    return Left.of(new Error(`#${named.name} on <${node.name}>: a container has no element to name`));
  }
  return Right.of(undefined);
}

/** A `<template #name>`: its body, and the `let-` names its context gives. */
function declarationOf(
  node: ElementNode,
  name: string,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledDeclaration> {
  const names = node.attributes
    .filter((attribute) => attribute.name.startsWith("let-"))
    .map((attribute) => attribute.name.slice("let-".length));
  const reserved = names.find((letName) => letName.startsWith("$"));
  if (reserved !== undefined) {
    return Left.of(new Error(`"let-${reserved}" on <template #${name}>: names starting with $ are the framework's`));
  }
  const invalid = names.find((letName) => !/^[A-Za-z_][\w$]*$/.test(letName));
  if (invalid !== undefined) {
    return Left.of(new Error(`"let-${invalid}" on <template #${name}> is not a name`));
  }
  return map(compileTemplate(node.children, candidates), (body): CompiledDeclaration => ({
    kind: "declaration",
    name,
    names,
    body,
  }));
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

/** An element's attributes, classified by their kind. */
interface Classified {
  readonly references: readonly TemplateReference[];
  readonly attributes: readonly AttributeNode[];
  readonly classBindings: readonly ClassBindingNode[];
  readonly classObjects: readonly ValueBindingNode[];
  readonly inputBindings: readonly InputBindingNode[];
  readonly outputBindings: readonly OutputBindingNode[];
  readonly styleBindings: readonly ValueBindingNode[];
  readonly attributeBindings: readonly ValueBindingNode[];
}

const NO_ATTRIBUTES: Classified = {
  references: [],
  attributes: [],
  classBindings: [],
  classObjects: [],
  inputBindings: [],
  outputBindings: [],
  styleBindings: [],
  attributeBindings: [],
};

/**
 * Split the attributes of `node` into plain attributes, class bindings and
 * input bindings (parsing their expressions). Other binding syntax, or an
 * invalid expression, is the error.
 */
function classifyAttributes(node: ElementNode): Parsed<Classified> {
  return node.attributes.reduce<Parsed<Classified>>(
    (classified, attribute) => flatMap(classified, (current) =>
      classifyAttribute(attribute, node, current)),
    Right.of(NO_ATTRIBUTES),
  );
}

/** One attribute added to the classified attributes so far. */
function classifyAttribute(
  attribute: AttributeNode,
  node: ElementNode,
  current: Classified,
): Parsed<Classified> {
  if (attribute.name === "[class]") {
    return map(expressionOfAttribute(attribute, node), (expression): Classified => ({
      ...current,
      classObjects: [...current.classObjects, { name: "", expression }],
    }));
  }
  if (attribute.name.startsWith("#")) {
    return map(referenceOf(attribute, node, current.references), (reference): Classified => ({
      ...current,
      references: [...current.references, reference],
    }));
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
    return map(expressionOfAttribute(attribute, node), (expression): Classified => ({
      ...current,
      styleBindings: [...current.styleBindings, { name: styleName, expression }],
    }));
  }
  if (attrName !== undefined) {
    if (isEventAttribute(attrName)) {
      return Left.of(new Error(
        `[attr.${attrName}] on <${node.name}>: event attributes cannot be bound; use (${attrName.slice(2)}) instead`,
      ));
    }
    return map(expressionOfAttribute(attribute, node), (expression): Classified => ({
      ...current,
      attributeBindings: [...current.attributeBindings, { name: attrName, expression }],
    }));
  }
  if (className !== undefined) {
    return map(expressionOfAttribute(attribute, node), (expression): Classified => ({
      ...current,
      classBindings: [...current.classBindings, { name: className, expression }],
    }));
  }
  if (inputName !== undefined) {
    return map(expressionOfAttribute(attribute, node), (expression): Classified => ({
      ...current,
      inputBindings: [...current.inputBindings, { name: inputName, owner: inputOwner, expression }],
    }));
  }
  if (eventName !== undefined) {
    return flatMap(mapLeft(parseEventName(eventName, "event binding"), (error) =>
      new Error(`${error.message}, on <${node.name}>`)), ({ event, modifiers }) =>
      handlerBinding(attribute, node, current, {
        event,
        modifiers,
        owner: outputOwner,
        domFallback,
      }));
  }
  if (/^[[(]/.test(attribute.name)) {
    return Left.of(new Error(`Bindings are not supported yet: "${attribute.name}" on <${node.name}>`));
  }
  return Right.of({ ...current, attributes: [...current.attributes, attribute] });
}

/** The expression of a bound attribute's value, or the error it has. */
function expressionOfAttribute(attribute: AttributeNode, node: ElementNode): Parsed<Expression> {
  return mapLeft(ExpressionParser.parse(attribute.value), (error) =>
    new Error(`${error.message}, in ${attribute.name} on <${node.name}>`));
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
): Parsed<TemplateReference> {
  const component = attribute.name.startsWith("##");
  const name = attribute.name.slice(component ? 2 : 1);
  if (!REFERENCE_NAME.test(name)) {
    return Left.of(new Error(`"${attribute.name}" is not a template reference on <${node.name}>`));
  }
  if (declared.some((reference) => reference.name === name)) {
    return Left.of(new Error(`#${name} is declared twice on <${node.name}>`));
  }
  if (component) {
    if (attribute.value !== "") {
      return Left.of(new Error(`"${attribute.name}" on <${node.name}> takes no value`));
    }
    return Right.of({ name, target: { kind: "component" } });
  }
  if (attribute.value === "") {
    return Right.of({ name, target: { kind: "element" } });
  }
  if (!REFERENCE_NAME.test(attribute.value)) {
    return Left.of(new Error(`"${attribute.value}" is not an exportAs name on <${node.name}>`));
  }
  return Right.of({ name, target: { kind: "export", exportAs: attribute.value } });
}

/** The match an `@if` is: its body when the condition holds, and its `@else` otherwise. */
function truthyMatch(
  subject: Expression,
  block: BlockItem,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledMatch> {
  return flatMap(compileItems(block.body, candidates), (body) =>
    elseOf(subject, body, block, candidates));
}

function elseOf(
  subject: Expression,
  body: readonly CompiledNode[],
  block: BlockItem,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledMatch> {
  return map(optionalItems(block.otherwise, candidates), (otherwise): CompiledMatch => ({
    kind: "match",
    subject,
    cases: [{ pattern: { kind: "truthy" }, body }],
    default: otherwise,
  }));
}

/** A `@match`, from its arms and its subject. */
function matchOf(arms: Arms, block: BlockItem): Parsed<CompiledMatch> {
  return map(optionalSubject(block), (subject): CompiledMatch => ({
    kind: "match",
    subject,
    cases: arms.cases,
    default: arms.fallback,
  }));
}

/** A `@case` added to the arms: its header, and the items of its body. */
function caseArm(
  header: { readonly pattern: Pattern; readonly guard?: Expression },
  item: BlockItem,
  current: Arms,
  candidates: readonly DirectiveCandidate[],
): Parsed<Arms> {
  return map(compileItems(item.body, candidates), (body): Arms => ({
    ...current,
    cases: [...current.cases, { ...header, body }],
  }));
}

/** The items of a `@map`, after its list: the item name, then the track, then the body. */
function mapOfList(
  list: Expression,
  block: BlockItem,
  itemText: string,
  tracking: string | undefined,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledMap> {
  return flatMap(itemOf(itemText), (item) => mapOfItem(list, item, block, tracking, candidates));
}

function mapOfItem(
  list: Expression,
  item: Pattern,
  block: BlockItem,
  tracking: string | undefined,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledMap> {
  return flatMap(trackOf(block, tracking), (track) =>
    mapOfTrack(list, item, track, block, candidates));
}

function mapOfTrack(
  list: Expression,
  item: Pattern,
  track: CompiledTrack | undefined,
  block: BlockItem,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledMap> {
  return map(compileItems(block.body, candidates), (body): CompiledMap => ({
    kind: "map",
    list,
    item,
    track,
    body,
  }));
}

/** A `@case`'s header, with its guard when it has one. */
function guardedHeader(
  pattern: Pattern,
  block: BlockItem,
  guard: string | undefined,
): Parsed<{ pattern: Pattern; guard?: Expression }> {
  return map(optionalGuard(block, guard), (compiled) =>
    (compiled ? { pattern, guard: compiled } : { pattern }));
}

/** The elements of an element's parts, shaped as a `CompiledElement`. */
type ElementParts = Omit<CompiledElement, "kind" | "name" | "children">;

/** An element, once its checks pass: its content is compiled, and it is returned with its parts. */
function elementAfterChecks(
  node: ElementNode,
  parts: ElementParts,
  candidates: readonly DirectiveCandidate[],
): Parsed<CompiledNode> {
  if (parts.inputBindings.length > 0 && parts.directives.length === 0 && isNone(parts.component)) {
    return Left.of(new Error(
      `[${parts.inputBindings[0]!.name}] on <${node.name}>: only inputs can be bound, `
      + "and no imported directive or component matches this element",
    ));
  }
  // A component's element has content too: the component shows it in its `<slot>`s.
  return map(compileTemplate(node.children, candidates), (children): CompiledNode => ({
    kind: "element",
    name: node.name,
    children,
    ...parts,
  }));
}

/** An output binding of an element, once its event and handler are parsed. */
function handlerBinding(
  attribute: AttributeNode,
  node: ElementNode,
  current: Classified,
  binding: {
    readonly event: string;
    readonly modifiers: readonly EventModifier[];
    readonly owner: string | undefined;
    readonly domFallback: DomFallback | undefined;
  },
): Parsed<Classified> {
  const handler = mapLeft(parseHandler(attribute.value, "event handler"), (error) =>
    new Error(`${error.message}, on <${node.name}>`));
  return map(handler, (parsed): Classified => ({
    ...current,
    outputBindings: [
      ...current.outputBindings,
      {
        name: binding.event,
        owner: binding.owner,
        modifiers: binding.modifiers,
        handler: parsed,
        ...(binding.domFallback && { domFallback: binding.domFallback }),
      },
    ],
  }));
}
