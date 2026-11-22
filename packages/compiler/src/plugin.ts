// A Vite plugin that compiles the templates of an app's components at build time.
//
// For each file that declares a component, it reads the component's template and
// the directives its `imports` list gives. It runs compileSource on them: a template
// that does not compile fails the build, with the file, the component and the error.
//
// By default that is all: the source is unchanged, and the templates stay strings.
// With `emit: true`, a template that compiles is also replaced in the file by the
// expression that rebuilds its compiled tree (emitCompiled), so the component skips
// the parser and the compiler at run time. That costs bundle size (see
// IMPROVEMENTS.md), so it is for an app that measures a gain. The file's helper
// imports are added at its top, under names that cannot clash with its own.
//
// A component is skipped, with a warning, when something it needs is not written as
// a literal (its template, its `imports` or a directive's selector), or when an
// imported directive cannot be found. Such a component keeps its template string.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Class } from "@tinker/core";
import { compileSource, emitCompiled, type ImportedSelector, TemplateCompileError } from "@tinker/core/compiler";
import MagicString from "magic-string";
import type { Plugin } from "vite";
import {
  type Declaration,
  identifiersIn,
  readSource,
  type SourceInfo,
  type TemplateSource,
  textOf,
} from "./declarations.ts";

/** What the check needs from its caller: resolving an import, and reporting. */
export interface CheckHost {
  /** The file an import of `source` from `importer` is, or null when it is not found. */
  resolve(source: string, importer: string): Promise<string | null>;
  /** Fails the build with `message`. */
  error(message: string): never;
  warn(message: string): void;
}

/** Text to put in place of a range of the source: a template, now its compiled expression. */
export interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** The names the emitted code uses for the helpers, aliased so they cannot clash with the file. */
const HELPERS = { Maybe: "__tinkerMaybe", Selector: "__tinkerSelector" };
const HELPER_IMPORTS = [
  `import { Maybe as ${HELPERS.Maybe} } from "@tinker/functional";`,
  `import { Selector as ${HELPERS.Selector} } from "@tinker/core/compiler";`,
  "",
].join("\n");

/** The plugin's options. */
export interface CompilerOptions {
  /** Replace each compiled template with its emitted tree. Off by default. */
  readonly emit?: boolean;
  /**
   * Fail the build for a component that cannot be checked (a template, imports or a
   * selector that is not a literal), instead of skipping it with a warning. Off by default.
   */
  readonly strict?: boolean;
}

/** How a compile run behaves: see CompilerOptions. */
export interface CompileMode {
  readonly emit: boolean;
  readonly strict: boolean;
}

/** The plugin: compiles the templates of components in each source file it transforms. */
export function tinkerCompiler(options: CompilerOptions = {}): Plugin {
  const mode: CompileMode = { emit: options.emit ?? false, strict: options.strict ?? false };
  return {
    name: "tinker:compile-templates",
    enforce: "pre",
    async transform(code, id) {
      if (!isSourceWithComponents(code, id)) {
        return null;
      }
      const emitted = await emitFile(code, id, {
        resolve: async (source, importer) => (await this.resolve(source, importer))?.id ?? null,
        error: (message) => this.error(message),
        warn: (message) => this.warn(message),
      }, mode);
      return emitted ?? null;
    },
  };
}

/** A file with its templates replaced, and the source map from the original. */
export interface EmittedFile {
  readonly code: string;
  readonly map: ReturnType<MagicString["generateMap"]>;
}

/**
 * The file `code` with its compiled templates replaced by their trees, and the helper
 * imports added. Undefined when no template is replaced (none compiles, or emit is off).
 */
export async function emitFile(
  code: string,
  filename: string,
  host: CheckHost,
  mode: CompileMode,
): Promise<EmittedFile | undefined> {
  const replacements = await compileComponents(code, filename, host, mode);
  if (replacements.length === 0) {
    return undefined;
  }
  const output = new MagicString(code);
  for (const replacement of replacements) {
    output.overwrite(replacement.start, replacement.end, replacement.text);
  }
  output.prepend(HELPER_IMPORTS);
  return {
    code: output.toString(),
    map: output.generateMap({ hires: true, source: filename, includeContent: true }),
  };
}

/** Whether `id` is a TypeScript file outside node_modules that mentions a component. */
function isSourceWithComponents(code: string, id: string): boolean {
  return /\.[cm]?tsx?$/.test(id)
    && !id.includes("node_modules")
    && /@(Component|Directive)\b/.test(code);
}

/**
 * Compiles every component declared in `code`. Fails through `host` on the first error,
 * and on a component that cannot be checked when `mode.strict` is set. Gives the
 * replacements for the templates to emit: none unless `mode.emit` is set.
 */
export async function compileComponents(
  code: string,
  filename: string,
  host: CheckHost,
  mode: CompileMode = { emit: false, strict: false },
): Promise<Replacement[]> {
  const source = readSource(code, filename);
  const replacements: Replacement[] = [];
  for (const declaration of source.declarations) {
    if (declaration.kind !== "component") {
      continue;
    }
    const where = `${basename(filename)}: <${declaration.name}>`;
    const template = await templateOf(declaration, source, filename, host);
    if (template === undefined) {
      skip(host, mode, where, "its template is not a literal");
      continue;
    }
    const replacement = await replacementFor(declaration, template, source, filename, host, mode);
    if (replacement !== undefined) {
      replacements.push(replacement);
    }
  }
  return replacements;
}

/**
 * The template of a component: its own literal or constant, or the constant of another
 * file it names. Undefined when none of these gives it.
 */
async function templateOf(
  declaration: Declaration,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<TemplateSource | undefined> {
  if (declaration.template !== undefined) {
    return declaration.template;
  }
  if (declaration.templateRef === undefined) {
    return undefined;
  }
  const ref = declaration.templateRef;
  const text = await constantValue(ref.name, source, filename, host);
  return text === undefined ? undefined : { text, start: ref.start, end: ref.end };
}

/**
 * The text of the constant `name` as the file sees it: its literal, its initializer
 * evaluated with the constants it uses, or the constant it imports from another file.
 * A name that depends on itself has no text.
 */
async function constantValue(
  name: string,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
  seen: ReadonlySet<string> = new Set(),
): Promise<string | undefined> {
  const key = `${filename}\0${name}`;
  if (seen.has(key)) {
    return undefined;
  }
  const inner = new Set(seen)
    .add(key);
  const literal = source.constants.get(name);
  if (literal !== undefined) {
    return literal;
  }
  const expression = source.expressions.get(name);
  if (expression !== undefined) {
    const texts = new Map<string, string>();
    for (const dependency of identifiersIn(expression)) {
      const text = await constantValue(dependency, source, filename, host, inner);
      if (text !== undefined) {
        texts.set(dependency, text);
      }
    }
    return textOf(expression, (dependency) => texts.get(dependency));
  }
  const binding = source.imports.find((imported) => imported.local === name);
  if (binding === undefined) {
    return undefined;
  }
  const file = await host.resolve(binding.source, filename);
  if (file === null) {
    return undefined;
  }
  return constantValue(binding.imported, readSource(readFileSync(file, "utf8"), file), file, host, inner);
}

/** A component that cannot be checked: an error in strict mode, a warning otherwise. */
function skip(host: CheckHost, mode: CompileMode, where: string, reason: string): void {
  if (mode.strict) {
    host.error(`${where} cannot be checked: ${reason}`);
  } else {
    host.warn(`${where} is not compiled: ${reason}`);
  }
}

async function replacementFor(
  declaration: Declaration,
  template: TemplateSource,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
  mode: CompileMode,
): Promise<Replacement | undefined> {
  const where = `${basename(filename)}: <${declaration.name}>`;
  const imports = await importedSelectors(declaration.imports, source, filename, host);
  if (!imports.isRead) {
    skip(host, mode, where, imports.reason);
    return undefined;
  }
  // Each import gets a placeholder class named as the file names it, so the emitted
  // expression can refer to it by that name.
  const classes = new Map<Class<object>, string>();
  const list: ImportedSelector[] = imports.selectors.map((imported) => {
    const type = placeholderFor(imported.name);
    classes.set(type, imported.name);
    return { selector: imported.selector, isComponent: imported.isComponent, type };
  });
  return compileSource(template.text, list)
    .match({
      left: (error) => host.error(`${where}: ${describe(error, template.text)}`),
      right: (nodes) => mode.emit
        ? { start: template.start, end: template.end, text: emitCompiled(nodes, classes, HELPERS) }
        : undefined,
    });
}

/**
 * The message for a compile error. A compile error gets its line and column in the
 * template; a syntax error already has them in its message.
 */
function describe(error: Error, text: string): string {
  if (!(error instanceof TemplateCompileError)) {
    return error.message;
  }
  const before = text.slice(0, error.span.start)
    .split("\n");
  const line = before.length;
  const column = before[before.length - 1]!.length + 1;
  return `${error.message}, at line ${line}, column ${column} of the template`;
}

function placeholderFor(name: string): Class<object> {
  return Object.defineProperty(class {}, "name", { value: name }) as Class<object>;
}

/** A directive a component imports, with its name in the importing file. */
interface NamedSelector {
  readonly name: string;
  readonly selector: string;
  readonly isComponent: boolean;
}

/** The selectors of the directives a component imports, or why they cannot be read. */
type ImportsRead
  = | { readonly isRead: true; readonly selectors: NamedSelector[] }
    | { readonly isRead: false; readonly reason: string };

async function importedSelectors(
  names: readonly string[] | undefined,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<ImportsRead> {
  if (names === undefined) {
    return { isRead: false, reason: "its imports are not a list of names" };
  }
  const selectors: NamedSelector[] = [];
  for (const name of names) {
    const selector = await selectorOf(name, source, filename, host);
    if (selector === undefined) {
      return { isRead: false, reason: `${name} has no literal selector, or is not found` };
    }
    selectors.push({ name, ...selector });
  }
  return { isRead: true, selectors };
}

/** The selector of the directive `name` as this file sees it: declared here, or imported. */
async function selectorOf(
  name: string,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<Pick<NamedSelector, "selector" | "isComponent"> | undefined> {
  const local = source.declarations.find((declaration) => declaration.name === name);
  if (local !== undefined) {
    return selectorInfo(local, source, filename, host);
  }
  const binding = source.imports.find((imported) => imported.local === name);
  if (binding === undefined) {
    return undefined;
  }
  const file = await host.resolve(binding.source, filename);
  if (file === null) {
    return undefined;
  }
  const fileSource = readSource(readFileSync(file, "utf8"), file);
  const declared = fileSource.declarations
    .find((declaration) => declaration.name === binding.imported);
  return declared === undefined ? undefined : selectorInfo(declared, fileSource, file, host);
}

/**
 * The selector of a directive: its literal or constant, or the constant of its own file
 * that it names. `source` and `filename` are the file that declares it.
 */
async function selectorInfo(
  declaration: Declaration,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<Pick<NamedSelector, "selector" | "isComponent"> | undefined> {
  const selector = declaration.selector
    ?? (declaration.selectorName === undefined
      ? undefined
      : await constantValue(declaration.selectorName, source, filename, host));
  if (selector === undefined) {
    return undefined;
  }
  return { selector, isComponent: declaration.kind === "component" };
}
