// Reads the components and directives a source file declares, and the imports
// it makes, from its syntax. The plugin needs them before anything is compiled:
// the selector of each directive a template may use, which the file that
// declares it gives as a string literal.
//
// A value is read when it is a literal, or the name of a `const` in the same file
// that is a literal. A selector or template named by a `const` of another file is recorded
// as a reference, for the plugin to resolve. Anything computed at run time is
// `undefined`, and the plugin then skips that component. Babel parses the source;
// nothing is evaluated.

import { parseSync } from "@babel/core";
import * as t from "@babel/types";

/** A template written as a literal, with the place it is in the source. */
export interface TemplateSource {
  readonly text: string;
  /** Where the literal starts and ends in the source, for replacing it. */
  readonly start: number;
  readonly end: number;
}

/** A value named by an identifier that is not a constant of this file: to resolve. */
export interface ValueRef {
  readonly name: string;
  /** Where the identifier is in the source, for replacing it. */
  readonly start: number;
  readonly end: number;
}

/** A class declared with `@Component` or `@Directive`. */
export interface Declaration {
  readonly name: string;
  readonly kind: "component" | "directive";
  /** The selector, when the decorator gives it as a literal, or a constant of this file. */
  readonly selector: string | undefined;
  /** The selector's name, when it is a constant of another file, to resolve. */
  readonly selectorName?: string;
  /** The template, when it is a literal, or a constant of this file. */
  readonly template: TemplateSource | undefined;
  /** The template, when it is a constant of another file, to resolve. */
  readonly templateRef?: ValueRef;
  /** The names in `imports`, when they are all plain identifiers. */
  readonly imports: readonly string[] | undefined;
  /** The `styleUrls` property, when the decorator has one. */
  readonly styleUrls?: UrlSource;
  /** The `templateUrl` property, when the decorator has one. */
  readonly templateUrl?: UrlSource;
  /** The `exportAs`, when the decorator gives it as a literal. */
  readonly exportAs: string | undefined;
  /** Whether the decorator gives an `exportAs` that is not a literal, which is not read. */
  readonly exportAsIsDynamic: boolean;
  /** The template names of its inputs, by property: from `input(…, { name: "…" })`. */
  readonly inputNames: Readonly<Record<string, string>>;
  /** Where the class statement ends: the registration of its input names goes after it. */
  readonly statementEnd: number;
}

/** A `styleUrls` or `templateUrl` property: the file it names (if a literal), and where it is. */
export interface UrlSource {
  /** The files it names, when they are all literals: a list's items, or the one string. */
  readonly urls: readonly string[] | undefined;
  /** Whether the value is a list (an array literal), as `styleUrls` must be. */
  readonly isList: boolean;
  /** Where the whole property (`styleUrls: [...]`) starts and ends, for replacing it. */
  readonly start: number;
  readonly end: number;
  /** Whether the component also gives the inline option (`styles`, `template`), which it cannot. */
  readonly hasInline: boolean;
}

/** A named import: `import { imported as local } from "source"`. */
export interface ImportBinding {
  readonly local: string;
  readonly imported: string;
  readonly source: string;
}

export interface SourceInfo {
  readonly declarations: readonly Declaration[];
  readonly imports: readonly ImportBinding[];
  /** The named re-exports: `export { imported as local } from "source"`. */
  readonly reexports: readonly ImportBinding[];
  /** The modules it re-exports everything from: `export * from "source"`. */
  readonly starExports: readonly string[];
  /** The `const`s of the file whose value is a string literal or a template without `${}`. */
  readonly constants: ReadonlyMap<string, string>;
  /** The initializer of every top-level `const`, to evaluate the ones not in `constants`. */
  readonly expressions: ReadonlyMap<string, t.Node>;
}

/** The declarations and named imports of one file. */
export function readSource(code: string, filename: string): SourceInfo {
  const file = parseSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: {
      plugins: ["typescript", "decorators"],
    },
  });
  // parseSync gives null only for a Babel configuration problem, not for source code.
  const body = (file as t.File).program.body;
  const constants = constantsOf(body);
  return {
    declarations: body.flatMap((statement) => declarationOf(statement, constants)),
    imports: body.flatMap(importsOf),
    reexports: body.flatMap(reexportsOf),
    starExports: body.flatMap(starExportsOf),
    constants,
    expressions: expressionsOf(body),
  };
}

/** The `const`s of the file whose value is a literal: their names and texts. */
function constantsOf(body: readonly t.Statement[]): ReadonlyMap<string, string> {
  const constants = new Map<string, string>();
  for (const statement of body) {
    const declared = t.isExportNamedDeclaration(statement) ? statement.declaration : statement;
    if (!t.isVariableDeclaration(declared) || declared.kind !== "const") {
      continue;
    }
    for (const declarator of declared.declarations) {
      // In declaration order, so a constant may be built from the ones before it.
      const text = literalOf(declarator.init ?? undefined, constants);
      if (t.isIdentifier(declarator.id) && text !== undefined) {
        constants.set(declarator.id.name, text);
      }
    }
  }
  return constants;
}

/** The initializer of each top-level `const` that has one, by name. */
function expressionsOf(body: readonly t.Statement[]): ReadonlyMap<string, t.Node> {
  const expressions = new Map<string, t.Node>();
  for (const statement of body) {
    const declared = t.isExportNamedDeclaration(statement) ? statement.declaration : statement;
    if (!t.isVariableDeclaration(declared) || declared.kind !== "const") {
      continue;
    }
    for (const declarator of declared.declarations) {
      if (t.isIdentifier(declarator.id) && declarator.init) {
        expressions.set(declarator.id.name, declarator.init);
      }
    }
  }
  return expressions;
}

/** The names of the identifiers that appear in an expression. */
export function identifiersIn(node: t.Node): string[] {
  const names: string[] = [];
  t.traverseFast(node, (child) => {
    if (t.isIdentifier(child)) {
      names.push(child.name);
    }
  });
  return names;
}

/** The declaration of a top-level class (exported or not), if it has one of ours. */
function declarationOf(
  statement: t.Statement,
  constants: ReadonlyMap<string, string>,
): Declaration[] {
  const declared = t.isExportNamedDeclaration(statement) ? statement.declaration : statement;
  if (!t.isClassDeclaration(declared) || !declared.id) {
    return [];
  }
  const decorator = (declared.decorators ?? []).map((item) => decoratorInfo(item, constants))
    .find(
      (info) => info !== undefined,
    );
  if (decorator === undefined) {
    return [];
  }
  return [{
    name: declared.id.name,
    ...decorator,
    inputNames: inputNamesOf(declared, constants),
    statementEnd: statement.end as number,
  }];
}

/**
 * The template names of a class's inputs, by property: each `x = input(…, { name: "…" })` whose
 * name is a literal (or a constant of the file). An input without a name is not listed.
 */
function inputNamesOf(
  declared: t.ClassDeclaration,
  constants: ReadonlyMap<string, string>,
): Readonly<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const member of declared.body.body) {
    if (!t.isClassProperty(member) || member.computed || !t.isIdentifier(member.key)) {
      continue;
    }
    const name = nameOfInput(member.value, constants);
    if (name !== undefined) {
      names[member.key.name] = name;
    }
  }
  return names;
}

/**
 * The `name` of an `input(…)` call: its options are the argument that is an object, the
 * second one or (alone) the first, as `input()` reads them. Undefined when there is none.
 */
function nameOfInput(
  value: t.Expression | null | undefined,
  constants: ReadonlyMap<string, string>,
): string | undefined {
  if (!t.isCallExpression(value) || !t.isIdentifier(value.callee, { name: "input" })) {
    return undefined;
  }
  const args = value.arguments;
  const options = args.length === 1 ? args[0] : args[1];
  if (!t.isObjectExpression(options)) {
    return undefined;
  }
  return literalOf(propertyOf(options, "name"), constants);
}

/** The kind and the literal options of a `@Component({...})` or `@Directive({...})`. */
function decoratorInfo(
  decorator: t.Decorator,
  constants: ReadonlyMap<string, string>,
): Omit<Declaration, "name" | "inputNames" | "statementEnd"> | undefined {
  const call = decorator.expression;
  if (!t.isCallExpression(call) || !t.isIdentifier(call.callee)) {
    return undefined;
  }
  const kind = KINDS.get(call.callee.name);
  const options = call.arguments[0];
  if (kind === undefined || !t.isObjectExpression(options)) {
    return undefined;
  }
  const selector = propertyOf(options, "selector");
  const template = propertyOf(options, "template");
  const styleUrls = urlOf(options, "styleUrls", "styles", constants);
  const templateUrl = urlOf(options, "templateUrl", "template", constants);
  const exportAs = propertyOf(options, "exportAs");
  return {
    kind,
    selector: literalOf(selector, constants),
    selectorName: nameOf(selector, constants),
    template: templateOf(template, constants),
    templateRef: refOf(template, constants),
    imports: identifiersOf(propertyOf(options, "imports")),
    exportAs: literalOf(exportAs, constants),
    exportAsIsDynamic: exportAs !== undefined && literalOf(exportAs, constants) === undefined,
    ...(styleUrls && { styleUrls }),
    ...(templateUrl && { templateUrl }),
  };
}

/** The file names of a string literal, or of an array of them: undefined if one is not. */
function urlsOf(
  value: t.Expression,
  constants: ReadonlyMap<string, string>,
): readonly string[] | undefined {
  if (!t.isArrayExpression(value)) {
    const url = literalOf(value, constants);
    return url === undefined ? undefined : [url];
  }
  const urls: string[] = [];
  for (const element of value.elements) {
    const url = element === null || t.isSpreadElement(element)
      ? undefined
      : literalOf(element, constants);
    if (url === undefined) {
      return undefined;
    }
    urls.push(url);
  }
  return urls;
}

/** The file named by `key` in a decorator's options, when there is one: nothing otherwise. */
function urlOf(
  options: t.ObjectExpression,
  key: string,
  inline: string,
  constants: ReadonlyMap<string, string>,
): UrlSource | undefined {
  const property = options.properties.find((candidate) =>
    t.isObjectProperty(candidate) && keyOf(candidate) === key);
  if (!t.isObjectProperty(property)) {
    return undefined;
  }
  return {
    urls: urlsOf(property.value as t.Expression, constants),
    isList: t.isArrayExpression(property.value),
    start: property.start as number,
    end: property.end as number,
    hasInline: propertyOf(options, inline) !== undefined,
  };
}

const KINDS = new Map<string, "component" | "directive">([
  ["Component", "component"],
  ["Directive", "directive"],
]);

/** The value of a property named `key` in an object literal, if there is one. */
function propertyOf(object: t.ObjectExpression, key: string): t.Expression | undefined {
  const found = object.properties.find((property) =>
    t.isObjectProperty(property) && keyOf(property) === key);
  return t.isObjectProperty(found) ? found.value as t.Expression : undefined;
}

function keyOf(property: t.ObjectProperty): string | undefined {
  if (t.isIdentifier(property.key) && !property.computed) {
    return property.key.name;
  }
  return t.isStringLiteral(property.key) ? property.key.value : undefined;
}

/**
 * The text of a string literal, of a template literal, of a `+` of two such texts, or of
 * a constant of this file (`constants`) named by an identifier. Otherwise none.
 */
function literalOf(
  value: t.Node | undefined,
  constants: ReadonlyMap<string, string>,
): string | undefined {
  return textOf(value, (name) => constants.get(name));
}

/**
 * The text of a string literal, of a template literal, of a `+` of two such texts, or
 * of an identifier, which `lookup` gives the text of. Otherwise none.
 */
export function textOf(
  value: t.Node | undefined,
  lookup: (name: string) => string | undefined,
): string | undefined {
  if (t.isStringLiteral(value)) {
    return value.value;
  }
  if (t.isIdentifier(value)) {
    return lookup(value.name);
  }
  if (t.isTemplateLiteral(value)) {
    return textOfTemplate(value, lookup);
  }
  if (t.isBinaryExpression(value, { operator: "+" })) {
    const left = textOf(value.left, lookup);
    const right = textOf(value.right, lookup);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

/** The text of a template literal, when each of its substitutions has a text. */
function textOfTemplate(
  value: t.TemplateLiteral,
  lookup: (name: string) => string | undefined,
): string | undefined {
  let text = "";
  for (const [index, quasi] of value.quasis.entries()) {
    // An untagged template has its cooked text: no escape can make it null.
    text += quasi.value.cooked as string;
    const substitution = value.expressions[index];
    if (substitution !== undefined) {
      const inner = textOf(substitution, lookup);
      if (inner === undefined) {
        return undefined;
      }
      text += inner;
    }
  }
  return text;
}

/** The name of an identifier that is not a constant of this file: a value to resolve elsewhere. */
function nameOf(
  value: t.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): string | undefined {
  return t.isIdentifier(value) && !constants.has(value.name) ? value.name : undefined;
}

/** The template at `value`, with where it is in the source. */
function templateOf(
  value: t.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): TemplateSource | undefined {
  const text = literalOf(value, constants);
  return text === undefined || value === undefined
    ? undefined
    : { text, start: value.start as number, end: value.end as number };
}

/** The reference to a constant of another file that `value` names, with where it is. */
function refOf(
  value: t.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): ValueRef | undefined {
  const name = nameOf(value, constants);
  return name === undefined || value === undefined
    ? undefined
    : { name, start: value.start as number, end: value.end as number };
}

/** The names of an array of identifiers, or `undefined` if it has anything else. */
function identifiersOf(value: t.Expression | undefined): readonly string[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!t.isArrayExpression(value)) {
    return undefined;
  }
  const names = value.elements.map((element) =>
    t.isIdentifier(element) ? element.name : forwardRefName(element));
  return names.every((name) => name !== undefined) ? names as string[] : undefined;
}

/**
 * The class a `ForwardRef.of(() => Name)` element refers to, which may be declared later in the
 * file (a component that imports itself). Undefined for any other element.
 */
function forwardRefName(element: t.Expression | t.SpreadElement | null): string | undefined {
  if (!t.isCallExpression(element)) {
    return undefined;
  }
  const { callee, arguments: args } = element;
  const isForwardRefOf = t.isMemberExpression(callee)
    && t.isIdentifier(callee.object, { name: "ForwardRef" })
    && t.isIdentifier(callee.property, { name: "of" });
  const [thunk] = args;
  if (!isForwardRefOf || thunk === undefined || !t.isArrowFunctionExpression(thunk)) {
    return undefined;
  }
  return t.isIdentifier(thunk.body) ? thunk.body.name : undefined;
}

/**
 * The named re-exports of an `export { imported as local } from "source"` declaration, as
 * bindings: `local` is the exported name, `imported` the name in `source`.
 */
function reexportsOf(statement: t.Statement): ImportBinding[] {
  if (!t.isExportNamedDeclaration(statement) || !statement.source) {
    return [];
  }
  const source = statement.source.value;
  return statement.specifiers.flatMap((specifier) => {
    if (!t.isExportSpecifier(specifier)) {
      return [];
    }
    const local = t.isIdentifier(specifier.exported)
      ? specifier.exported.name
      : specifier.exported.value;
    const imported = t.isIdentifier(specifier.local)
      ? specifier.local.name
      : specifier.local.value;
    return [{ local, imported, source }];
  });
}

/** The modules a file re-exports everything from: `export * from "source"`. */
function starExportsOf(statement: t.Statement): string[] {
  return t.isExportAllDeclaration(statement) ? [statement.source.value] : [];
}

/** The named imports of an `import` declaration. Default and namespace imports are not read. */
function importsOf(statement: t.Statement): ImportBinding[] {
  if (!t.isImportDeclaration(statement)) {
    return [];
  }
  return statement.specifiers.flatMap((specifier) => {
    if (!t.isImportSpecifier(specifier)) {
      return [];
    }
    const imported = t.isIdentifier(specifier.imported)
      ? specifier.imported.name
      : specifier.imported.value;
    return [{ local: specifier.local.name, imported, source: statement.source.value }];
  });
}
