// Reads the components and directives a source file declares, and the imports
// it makes, from its syntax. The plugin needs them before anything is compiled:
// the selector of each directive a template may use, which the file that
// declares it gives as a string literal.
//
// Only what is written as a literal is read. A selector, template or `imports`
// list computed at run time is `undefined`, and the plugin then skips that
// component. Babel parses the source; nothing is evaluated.

import { parseSync } from "@babel/core";
import * as t from "@babel/types";

/** A template written as a literal, with the place it is in the source. */
export interface TemplateSource {
  readonly text: string;
  /** Where the literal starts and ends in the source, for replacing it. */
  readonly start: number;
  readonly end: number;
}

/** A class declared with `@Component` or `@Directive`. */
export interface Declaration {
  readonly name: string;
  readonly kind: "component" | "directive";
  /** The selector, when the decorator gives it as a string literal. */
  readonly selector: string | undefined;
  /** The template, when it is a string or a template literal with no `${}`. */
  readonly template: TemplateSource | undefined;
  /** The names in `imports`, when they are all plain identifiers. */
  readonly imports: readonly string[] | undefined;
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
  return {
    declarations: body.flatMap(declarationOf),
    imports: body.flatMap(importsOf),
  };
}

/** The declaration of a top-level class (exported or not), if it has one of ours. */
function declarationOf(statement: t.Statement): Declaration[] {
  const declared = t.isExportNamedDeclaration(statement) ? statement.declaration : statement;
  if (!t.isClassDeclaration(declared) || !declared.id) {
    return [];
  }
  const decorator = (declared.decorators ?? []).map(decoratorInfo)
    .find(
      (info) => info !== undefined,
    );
  if (decorator === undefined) {
    return [];
  }
  return [{ name: declared.id.name, ...decorator }];
}

/** The kind and the literal options of a `@Component({...})` or `@Directive({...})`. */
function decoratorInfo(
  decorator: t.Decorator,
): Omit<Declaration, "name"> | undefined {
  const call = decorator.expression;
  if (!t.isCallExpression(call) || !t.isIdentifier(call.callee)) {
    return undefined;
  }
  const kind = KINDS.get(call.callee.name);
  const options = call.arguments[0];
  if (kind === undefined || !t.isObjectExpression(options)) {
    return undefined;
  }
  return {
    kind,
    selector: literalOf(propertyOf(options, "selector")),
    template: templateOf(propertyOf(options, "template")),
    imports: identifiersOf(propertyOf(options, "imports")),
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

/** A string literal, or a template literal with no substitutions, as its text. */
function literalOf(value: t.Expression | undefined): string | undefined {
  if (t.isStringLiteral(value)) {
    return value.value;
  }
  if (t.isTemplateLiteral(value) && value.expressions.length === 0) {
    // An untagged template has its cooked text: no escape can make it null.
    return value.quasis[0]!.value.cooked as string;
  }
  return undefined;
}

/** The template literal at `value`, with where it is in the source. */
function templateOf(value: t.Expression | undefined): TemplateSource | undefined {
  const text = literalOf(value);
  return text === undefined || value === undefined
    ? undefined
    : { text, start: value.start as number, end: value.end as number };
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
    t.isIdentifier(element) ? element.name : undefined);
  return names.every((name) => name !== undefined) ? names as string[] : undefined;
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
