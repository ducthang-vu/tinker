// The type check of a component's template: TypeScript that reads each expression of the template
// against the component's class, so `tsc` (`npm run typecheck`) reports what the run time would
// only fail on: an unknown member, a call of a field that is not a function, a wrong argument.
//
// The check is a function per component, taking the component as `$c`. Each expression is a
// statement in it, and the template's blocks are blocks of the function, so a name is in scope
// where the template makes it visible. Typed:
// - the component's members (read as `$c["name"]`, so a private member still resolves), `@let`
//   values, and imported template functions (through the class instance);
// - a `@map`'s items: the list must be an array, and each name its `let` binds is typed from the
//   list's item type, as the run time binds it; its `$`-specials; its `track`, in the row's scope;
// - a `@case`'s names: from the subject, narrowed by the case's pattern (a literal field, a
//   `typeof` test, `present`, the keys an object pattern reads), through `Maybe` and `Either`
//   cases and alternatives too;
// - references: `#name` is its element, `##name` the component, `#name="exportAs"` the directive;
// - handlers: called with `$event`, the value of the outputs of that name of the element's
//   directives and component, or else its DOM event.
// A directive the check cannot import (not exported) or whose base classes it cannot read is not
// typed: references to it and `$event` on its element are `any`. `let-` names are `any`: the
// context that gives them is a value of the run time, which the template does not type.

import { posix } from "node:path";
import type { CompiledNode, Expression } from "@tinker/core/compiler";
import { namesIn } from "@tinker/core/compiler";
import { match } from "@tinker/functional";

/** A template function a component imports: what it is called by, and the class that makes it. */
export interface CheckedFunction {
  /** The name a template calls it by. */
  readonly name: string;
  /** The class's name, as its file exports it. */
  readonly className: string;
  /** The absolute path of the class's file. */
  readonly file: string;
}

/**
 * A directive or component a component imports: what its template's elements name it by, the
 * class that makes it, and what the check reads of it.
 */
export interface CheckedDirective {
  /** The name the importing file gives it: an element's directives are named by it. */
  readonly name: string;
  /** The class's name, as its file exports it. */
  readonly className: string;
  /** The absolute path of the class's file. */
  readonly file: string;
  readonly selector: string;
  readonly exportAs?: string;
  /** Its own and inherited properties and methods: its outputs are among them. */
  readonly members: readonly string[];
}

/** A component's compiled template, with what it imports: what the check needs. */
export interface CheckedTemplate {
  /** The component's class name, as its file exports it. */
  readonly name: string;
  /** The absolute path of the component's file. */
  readonly file: string;
  readonly nodes: readonly CompiledNode[];
  readonly functions: readonly CheckedFunction[];
  /** The directives and components it imports whose class the check can import. */
  readonly directives: readonly CheckedDirective[];
}

/** A `@map` node, and what its item is matched with, and its `track`. */
type MapNode = Extract<CompiledNode, { kind: "map" }>;
type Pattern = MapNode["item"];
type Track = MapNode["track"];

/** An element of a compiled template. */
type ElementNode = Extract<CompiledNode, { kind: "element" }>;

/** What the check of a template knows besides its scope: its template functions and directives. */
interface CheckContext {
  /** The names of the template functions the component imports. */
  readonly fns: ReadonlySet<string>;
  /** The directives and components it imports that are typed, by the name its elements use. */
  readonly directives: ReadonlyMap<string, TypedDirective>;
}

/** A directive or component the check can type: what it reads of it, and its instance. */
interface TypedDirective {
  readonly info: CheckedDirective;
  /** The constant the check declares as its instance: `$dir_0`. */
  readonly instance: string;
}

/** The local names of a scope: what the template makes visible at a point. */
type Scope = ReadonlySet<string>;

/** The import specifier from the output file to `file` (a `.ts` file): relative, with `./`. */
function specifierOf(outputFile: string, file: string): string {
  const relative = posix.relative(posix.dirname(outputFile), file);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/**
 * The TypeScript file that checks the templates of the components in one source file. It imports
 * the classes; each component's check is an exported function, `check_<Name>`.
 *
 * @param templates The components of the source file, with their compiled templates.
 * @param outputFile The absolute path of the file written (next to the source).
 * @returns The file's text.
 */
export function checkFileOf(templates: readonly CheckedTemplate[], outputFile: string): string {
  const aliases = new Map<string, string>();
  const imports: string[] = [];
  const aliasOf = (fn: { readonly className: string; readonly file: string }): string => {
    const key = `${fn.file}\0${fn.className}`;
    let alias = aliases.get(key);
    if (alias === undefined) {
      alias = `$cls_${aliases.size}`;
      aliases.set(key, alias);
      imports.push(`import { ${fn.className} as ${alias} } from "${specifierOf(outputFile, fn.file)}";`);
    }
    return alias;
  };
  const checks = templates.map((template) => {
    const declared = template.functions.map((fn) =>
      `  const $fn_${fn.name}: InstanceType<typeof ${aliasOf(fn)}> = null as never;`);
    const directives = new Map(template.directives.map((info, index) =>
      [info.name, { info, instance: `$dir_${index}` }] as const));
    const instances = template.directives.map((info, index) =>
      `  const $dir_${index} = null as never as InstanceType<typeof ${aliasOf(info)}>;`);
    const body = emitNodes(template.nodes, new Set(), {
      fns: new Set(template.functions.map((fn) => fn.name)),
      directives,
    });
    return [
      `export function check_${template.name}($c: ${template.name}): void {`,
      "  const $flow = (...fns: any[]): any => fns;",
      ...declared,
      ...instances,
      ...body.map((line) => `  ${line}`),
      "}",
    ].join("\n");
  });
  const classes = templates.map((template) => template.name);
  const own = `import type { ${classes.join(", ")} } from "${specifierOf(outputFile, templates[0]?.file ?? outputFile)}";`;
  const text = checks.join("\n");
  const boxes = /\$(Some|Ok|Error)</.test(text) ? BOX_HELPERS : [];
  const helpers = [
    ...new Set(HELPERS.flatMap(([used, lines]) => (text.includes(used) ? lines : []))),
  ];
  return [
    "// Generated by tinker-types from the templates of this file. Do not edit: it is rewritten by",
    "// `npm run typecheck`.",
    ...(templates.length === 0 ? [] : [own]),
    ...imports,
    ...boxes,
    ...helpers,
    "",
    checks.join("\n\n"),
    "",
  ].join("\n");
}

/** The lines checking `nodes` in `scope`, with the names each node declares visible after it. */
function emitNodes(
  nodes: readonly CompiledNode[],
  scope: Scope,
  context: CheckContext,
): string[] {
  const lines: string[] = [];
  let visible = scope;
  for (const node of nodes) {
    const emitted = emitNode(node, visible, context);
    lines.push(...emitted.lines);
    visible = emitted.visible;
  }
  return lines;
}

/**
 * The declarations of names with their types. Each is cast, not annotated: a const annotated with
 * a union would be narrowed to its initializer.
 *
 * @param typed Each name, with its type.
 * @returns A declaration per name.
 */
function declarationsOf(typed: readonly (readonly [string, string])[]): string[] {
  return typed.map(([name, type]) => `const ${name} = null as never as ${type};`);
}

/** A block of `lines`, whose `declared` names are `any` (not typed yet). */
function blockOf(declared: readonly string[], lines: readonly string[]): string[] {
  return ["{", ...declared.map((name) => `  const ${name}: any = undefined;`), ...lines.map((line) => `  ${line}`), "}"];
}

function emitNode(
  node: CompiledNode,
  scope: Scope,
  context: CheckContext,
): { readonly lines: string[]; readonly visible: Scope } {
  switch (node.kind) {
    case "text":
      return {
        lines: node.interpolation.expressions
          .map((expression) => statement(expression, scope, context.fns)),
        visible: scope,
      };
    case "let":
      return {
        lines: [`const ${node.name} = ${expressionOf(node.expression, scope, context.fns)};`],
        visible: withNames(scope, [node.name]),
      };
    case "match": {
      // Each case's names are typed from the subject, narrowed by the case's pattern.
      const subject = node.subject === undefined
        ? []
        : [`const $subject = ${expressionOf(node.subject, scope, context.fns)};`];
      const type = node.subject === undefined ? "unknown" : "typeof $subject";
      const inner = [...subject];
      for (const current of node.cases) {
        const inCase = withNames(scope, namesIn(current.pattern).declared);
        const guard = current.guard === undefined
          ? []
          : [statement(current.guard, inCase, context.fns)];
        inner.push(...blockOf([], [
          ...declarationsOf(typesOf(current.pattern, type)),
          ...guard,
          ...emitNodes(current.body, inCase, context),
        ]));
      }
      if (node.default !== undefined) {
        inner.push(...blockOf([], emitNodes(node.default, scope, context)));
      }
      return { lines: blockOf([], inner), visible: scope };
    }
    case "map": {
      const item = namesIn(node.item).declared;
      const inItem = withNames(scope, [...item, ...SPECIALS.map(([name]) => name)]);
      // The list must be an array, as at run time; each name the item binds is typed from it.
      const row = "(typeof $list)[number]";
      const specials = SPECIALS.map(([, declaration]) => declaration);
      const inner = [
        ...declarationsOf(typesOf(node.item, row)),
        ...specials,
        ...trackOf(node.track, row, inItem, context.fns),
        ...emitNodes(node.body, inItem, context),
      ];
      const lines = blockOf([], [
        `const $list = (${expressionOf(node.list, scope, context.fns)}) satisfies readonly unknown[];`,
        ...blockOf([], inner),
      ]);
      return { lines, visible: scope };
    }
    case "declaration": {
      const visible = withNames(scope, [node.name]);
      const lines = [`const ${node.name}: any = undefined;`];
      const body = emitNodes(node.body, withNames(visible, node.names), context);
      lines.push(...blockOf(node.names, body));
      return { lines, visible };
    }
    case "element": {
      const owned = ownedBy(node, context);
      const visible = withNames(scope, node.references.map((reference) => reference.name));
      const lines = declarationsOf(node.references.map((reference) =>
        [reference.name, referenceType(reference, node.name, owned)] as const));
      const bindings = [
        ...node.attributeBindings,
        ...node.classBindings,
        ...node.classObjects,
        ...node.styleBindings,
        ...node.inputBindings,
      ];
      for (const binding of bindings) {
        lines.push(statement(binding.expression, visible, context.fns));
      }
      for (const output of node.outputBindings) {
        lines.push(...blockOf([], [
          ...eventOf(output, owned),
          statement(output.handler.call, withNames(visible, ["$event"]), context.fns),
        ]));
      }
      lines.push(...blockOf([], emitNodes(node.children, visible, context)));
      return { lines, visible };
    }
    case "slot":
      return { lines: [], visible: scope };
  }
}

/**
 * The names `pattern` binds, each with the TypeScript type of what it binds when it matches a
 * value of type `type`. A name, `as`, object and array patterns read their part of the type, so a
 * field the type does not have, or an index past a tuple's end, is a type error, as the run time
 * would throw. `some`, `ok` and `error` read the value of a `Some`, a `Right` or a `Left` among
 * the type's cases (the helpers of `BOX_HELPERS`). A name of an alternative is the union of what
 * each option binds it to. A regex group is a string, or undefined when the group did not take
 * part. The other patterns bind nothing.
 */
function typesOf(pattern: Pattern, type: string): (readonly [string, string])[] {
  switch (pattern.kind) {
    case "bind":
      return [[pattern.name, type]];
    case "as":
      return [...typesOf(pattern.pattern, type), [pattern.name, narrowed(type, pattern.pattern)]];
    case "object": {
      const object = withKeys(narrowed(type, pattern), pattern.fields);
      return pattern.fields.flatMap((field) =>
        typesOf(field.pattern, `(${object})[${JSON.stringify(field.key)}]`));
    }
    case "array": {
      const array = narrowed(type, pattern);
      return [
        ...pattern.items.flatMap((item, index) => typesOf(item, `(${array})[${index}]`)),
        ...(pattern.rest === undefined ? [] : [[pattern.rest, `(${array})[number][]`] as const]),
      ];
    }
    case "regex":
      return pattern.names.map((name) => [name, "string | undefined"] as const);
    case "some":
      return typesOf(pattern.pattern, `$Some<${type}>`);
    case "ok":
      return typesOf(pattern.pattern, `$Ok<${type}>`);
    case "error":
      return typesOf(pattern.pattern, `$Error<${type}>`);
    case "alt":
      return unionOf(
        namesIn(pattern).declared,
        pattern.options.map((option) => typesOf(option, type)),
      );
    default:
      return [];
  }
}

/**
 * `type`, narrowed to what `pattern` matches (with the `$Narrow` helper), or `type` itself when the
 * pattern does not constrain it.
 *
 * @param type The type of the value matched.
 * @param pattern The pattern it is matched with.
 * @returns The type of the values that match.
 */
function narrowed(type: string, pattern: Pattern): string {
  const shape = shapeOf(pattern);
  return shape === undefined ? type : `$Narrow<${type}, ${shape}>`;
}

/**
 * `type`, kept to the cases that have every key an object pattern reads and none of its `absent`
 * keys, as the run time tests them (with the `$Keys` helper).
 *
 * @param type The type of the object matched.
 * @param fields The fields of the object pattern.
 * @returns The type of the cases that can match.
 */
function withKeys(type: string, fields: Extract<Pattern, { kind: "object" }>["fields"]): string {
  const keysOf = (absent: boolean) => fields
    .filter((field) => (field.pattern.kind === "absent") === absent)
    .map((field) => JSON.stringify(field.key));
  const present = keysOf(false);
  const absent = keysOf(true);
  if (present.length + absent.length === 0) {
    return type;
  }
  const union = (keys: readonly string[]) => keys.length === 0 ? "never" : keys.join(" | ");
  return `$Keys<${type}, ${union(present)}, ${union(absent)}>`;
}

/** What a `typeof` test names, as a TypeScript type. */
const TYPE_SHAPES: Readonly<Record<string, string>> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  object: "object",
  function: "(...args: never[]) => unknown",
};

/**
 * A type every value `pattern` matches is assignable to, or undefined when the pattern constrains
 * nothing a type can say. A literal is its literal type, a `typeof` test its type, `present` and
 * `truthy` a value that is not null or undefined, an object pattern an object with its constrained
 * fields, an array pattern a tuple. A `Maybe` or `Either` case is read by the `$Some`, `$Ok` and
 * `$Error` helpers instead, which keep only the cases that match.
 *
 * @param pattern The pattern.
 * @returns The type, as TypeScript.
 */
function shapeOf(pattern: Pattern): string | undefined {
  switch (pattern.kind) {
    case "value":
      return pattern.value === undefined ? "undefined" : JSON.stringify(pattern.value);
    case "type":
      return TYPE_SHAPES[pattern.type];
    case "present":
    case "truthy":
      return "{}";
    case "range":
      return "number";
    case "regex":
      return "string";
    case "as":
      return shapeOf(pattern.pattern);
    case "object": {
      const fields = pattern.fields.flatMap((field) => {
        const shape = shapeOf(field.pattern);
        return shape === undefined ? [] : [`${JSON.stringify(field.key)}: ${shape}`];
      });
      return fields.length === 0 ? "object" : `{ ${fields.join("; ")} }`;
    }
    case "array": {
      const items = pattern.items.map((item) => shapeOf(item) ?? "unknown");
      return `readonly [${[...items, ...(pattern.rest === undefined ? [] : ["...unknown[]"])].join(", ")}]`;
    }
    case "alt": {
      const options = pattern.options.map(shapeOf);
      return options.every((option) => option !== undefined) ? options.join(" | ") : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The names an alternative binds, each typed as the union of its types in the options. Every
 * option binds the same names.
 *
 * @param names The names the alternative binds.
 * @param options The names and types each option binds.
 * @returns Each name, with the union of its types.
 */
function unionOf(
  names: readonly string[],
  options: readonly (readonly (readonly [string, string])[])[],
): (readonly [string, string])[] {
  return names.map((name) => [
    name,
    options.map((option) => `(${option.find(([other]) => other === name)![1]})`)
      .join(" | "),
  ] as const);
}

/**
 * What a check file declares for a reference to an element, and for a handler: the element type of
 * a tag (`HTMLElement` for one the DOM does not type), the event of a DOM event name, the value an
 * output or a model emits, and the first of two types that is not `never`.
 */
const ELEMENT_HELPER = "type $Element<N> = N extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[N] : N extends keyof SVGElementTagNameMap ? SVGElementTagNameMap[N] : HTMLElement;";
const DOM_EVENT_HELPER = "type $DomEvent<N> = N extends keyof HTMLElementEventMap ? HTMLElementEventMap[N] : Event;";
const OR_HELPER = "type $Or<A, B> = [A] extends [never] ? B : A;";
const OUTPUT_HELPERS: readonly string[] = [
  "import type { ModelSignal as $ModelSignal, Output as $Output } from \"@tinker/core\";",
  "declare function $emitted<V>(output: V): V extends $Output<infer T> ? T : never;",
  "declare function $changed<V>(model: V): V extends $ModelSignal<infer T> ? T : never;",
];

/**
 * What a check file declares when a pattern narrows a type: the cases of `S` that can match the
 * shape `P`. A case that is a `P` is kept; any other is intersected with `P`, which leaves the part
 * that can match (`string` and `"a"` give `"a"`) and is `never` when nothing can (`number` and
 * `"a"`, or objects whose literal fields differ).
 */
const NARROW_HELPER = "type $Narrow<S, P> = S extends P ? S : S & P;";

/**
 * What a check file declares when an object pattern reads keys: the cases of `S` that have every
 * key of `K` and none of `A`. When no case has them, `S` itself, so that reading a key none of its
 * cases has is a type error rather than `never`.
 */
const KEYS_HELPERS: readonly string[] = [
  "type $KeyCases<S, K, A> = S extends unknown ? ([K] extends [keyof S] ? ([A & keyof S] extends [never] ? S : never) : never) : never;",
  "type $Keys<S, K, A> = [$KeyCases<S, K, A>] extends [never] ? S : $KeyCases<S, K, A>;",
];

/**
 * What a check file declares when its patterns read a `Maybe` or an `Either`: the value of the
 * `Some`, `Right` and `Left` cases of a type, which the type check infers from the classes of
 * `@tinker/functional`. A type with no such case gives `never`.
 */
const BOX_HELPERS: readonly string[] = [
  "import type { Left as $LeftCase, Right as $RightCase, Some as $SomeCase } from \"@tinker/functional\";",
  "type $Some<T> = T extends $SomeCase<infer V> ? V : never;",
  "type $Ok<T> = T extends $RightCase<infer V> ? V : never;",
  "type $Error<T> = T extends $LeftCase<infer E> ? E : never;",
];

/**
 * The lines checking a `@map`'s `track`: its expression, read in the row's scope, or each field it
 * names, read on the item, which must have it.
 */
function trackOf(
  track: Track,
  row: string,
  scope: Scope,
  fns: ReadonlySet<string>,
): string[] {
  if (track === undefined) {
    return [];
  }
  if (track.kind === "value") {
    return [statement(track.expression, scope, fns)];
  }
  return track.names.map((name) => `void (null as never as ${row})[${JSON.stringify(name)}];`);
}

/**
 * The directives and the component on an element, each typed, or undefined when the check cannot
 * type it (its class is not exported, or its base classes cannot be read).
 *
 * @param node The element.
 * @param context What the check knows of the component's imports.
 * @returns One entry per directive, then the component.
 */
function ownedBy(node: ElementNode, context: CheckContext): (TypedDirective | undefined)[] {
  const types = [
    ...node.directives,
    ...match(node.component, { Some: (component) => [component], None: () => [] }),
  ];
  return types.map((type) => context.directives.get(type.name));
}

/**
 * The type of a template reference: `#name` is the element, `##name` the component, and
 * `#name="exportAs"` the directive or component with that exportAs. When a directive or the
 * component on the element is not typed, a reference to one of them is `any`.
 *
 * @param reference The reference.
 * @param tag The element's name.
 * @param owned The directives and component on the element.
 * @returns The type, as TypeScript.
 */
function referenceType(
  reference: ElementNode["references"][number],
  tag: string,
  owned: readonly (TypedDirective | undefined)[],
): string {
  const { target } = reference;
  if (target.kind === "element") {
    return `$Element<${JSON.stringify(tag)}>`;
  }
  if (owned.includes(undefined)) {
    return "any";
  }
  // The compiler refuses a reference with no target: `##name` needs a component (the last of
  // `owned`), and `#name="exportAs"` a directive or component with that exportAs.
  const typed = owned as readonly TypedDirective[];
  const found = target.kind === "component"
    ? typed.at(-1)!
    : typed.find((directive) => directive.info.exportAs === target.exportAs)!;
  return `typeof ${found.instance}`;
}

/**
 * The declaration of `$event` in a handler, after the outputs it reads. The outputs of that name of
 * the element's directives and component (or of the one `(owner.name)` names) give their values;
 * with none, the DOM event of that name gives its event (`Event` for one the DOM does not type).
 * When a directive or the component on the element is not typed, `$event` is `any`.
 *
 * @param output The event binding.
 * @param owned The directives and component on the element.
 * @returns The lines declaring `$event`.
 */
function eventOf(
  output: ElementNode["outputBindings"][number],
  owned: readonly (TypedDirective | undefined)[],
): string[] {
  if (owned.includes(undefined)) {
    return ["const $event: any = undefined;"];
  }
  const { name, owner, domFallback } = output;
  const candidates = (owned as readonly TypedDirective[]).filter((directive) =>
    owner === undefined || [owner, `[${owner}]`].includes(directive.info.selector));
  const lower = name.toLowerCase();
  // Each output is read as a value, so a private one reads as it does at run time.
  const reads = candidates.flatMap(({ info, instance }) => info.members.flatMap((member) => {
    const read = `${instance}[${JSON.stringify(member)}]`;
    if (member.toLowerCase() === lower) {
      return [`$emitted(${read})`];
    }
    return `${member}Change`.toLowerCase() === lower ? [`$changed(${read})`] : [];
  }));
  let dom = "never";
  if (owner === undefined) {
    dom = `$DomEvent<${JSON.stringify(name)}>`;
  } else if (domFallback !== undefined) {
    dom = `$DomEvent<${JSON.stringify(domFallback.event)}>`;
  }
  const values = reads.map((_read, index) => `typeof $output_${index}`);
  return [
    ...reads.map((read, index) => `const $output_${index} = ${read};`),
    `const $event = null as never as ${values.length === 0 ? dom : `$Or<${values.join(" | ")}, ${dom}>`};`,
  ];
}

/** The `$`-specials of a `@map` and their types, each declared at the top of the item's block. */
const SPECIALS: readonly (readonly [string, string])[] = [
  ["$index", "const $index: number = 0;"],
  ["$first", "const $first: boolean = false;"],
  ["$last", "const $last: boolean = false;"],
  ["$even", "const $even: boolean = false;"],
  ["$odd", "const $odd: boolean = false;"],
  ["$count", "const $count: number = 0;"],
];

/** `scope` with `names` added. */
function withNames(scope: Scope, names: readonly string[]): Scope {
  return new Set([...scope, ...names]);
}

/** An expression as a statement, so that it is checked and its value is discarded. */
function statement(expression: Expression, scope: Scope, fns: ReadonlySet<string>): string {
  return `void (${expressionOf(expression, scope, fns)});`;
}

/**
 * The TypeScript of an expression. A bare name is a local when the scope declares it, a template
 * function when the component imports one, and else a member of the component.
 */
function expressionOf(expression: Expression, scope: Scope, fns: ReadonlySet<string>): string {
  switch (expression.kind) {
    case "literal":
      return expression.value === undefined ? "undefined" : JSON.stringify(expression.value);
    case "component":
      return "$c";
    case "property": {
      if (expression.receiver.kind !== "component") {
        const receiver = expressionOf(expression.receiver, scope, fns);
        return `(${receiver})${expression.optional === true ? "?." : ""}[${JSON.stringify(expression.name)}]`;
      }
      if (scope.has(expression.name)) {
        return expression.name;
      }
      if (fns.has(expression.name)) {
        return `((...args: any[]) => $fn_${expression.name}.call(...args))`;
      }
      return `$c[${JSON.stringify(expression.name)}]`;
    }
    case "call":
      return callOf(expression, scope, fns);
    case "binary":
      return `(${expressionOf(expression.left, scope, fns)} ${expression.operator} ${expressionOf(expression.right, scope, fns)})`;
    case "conditional":
      return `((${expressionOf(expression.test, scope, fns)}) ? (${expressionOf(expression.then, scope, fns)}) : (${expressionOf(expression.otherwise, scope, fns)}))`;
    case "not":
      return `!(${expressionOf(expression.operand, scope, fns)})`;
    case "negate":
      return `-(${expressionOf(expression.operand, scope, fns)})`;
    case "object":
      return `({ ${expression.fields.map((field) => `${JSON.stringify(field.key)}: ${expressionOf(field.value, scope, fns)}`)
        .join(", ")} })`;
    case "array":
      return `[${expression.items.map((item) => expressionOf(item, scope, fns))
        .join(", ")}]`;
  }
}

/**
 * A call. A template function is called through its class instance; `$flow` is the built-in, typed
 * loosely; anything else is called as written, so `this` is the receiver as at run time.
 */
function callOf(
  expression: Extract<Expression, { kind: "call" }>,
  scope: Scope,
  fns: ReadonlySet<string>,
): string {
  const args = expression.args.map((arg) => expressionOf(arg, scope, fns))
    .join(", ");
  const callee = expression.callee;
  if (callee.kind === "property" && callee.receiver.kind === "component" && !scope.has(callee.name)) {
    if (fns.has(callee.name)) {
      return `$fn_${callee.name}.call(${args})`;
    }
    if (callee.name === "$flow") {
      return `$flow(${args})`;
    }
  }
  return `(${expressionOf(callee, scope, fns)})(${args})`;
}

/** Each helper a check file declares, with what in the checks shows that they use it. */
const HELPERS: readonly (readonly [string, readonly string[]])[] = [
  ["$Narrow<", [NARROW_HELPER]],
  ["$Keys<", KEYS_HELPERS],
  ["$Element<", [ELEMENT_HELPER]],
  ["$DomEvent<", [DOM_EVENT_HELPER]],
  ["$Or<", [OR_HELPER]],
  ["$emitted(", OUTPUT_HELPERS.slice(0, 2)],
  ["$changed(", [OUTPUT_HELPERS[0]!, OUTPUT_HELPERS[2]!]],
];
