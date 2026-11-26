// A Vite plugin that compiles the templates of an app's components at build time.
// It also reads each component's `styleUrls` (a CSS file) into its `styles`, and its
// `templateUrl` (an HTML file) into its `template`, with or without `emit`: a component
// needs its CSS and template at run time, and a template that is not emitted stays a string.
//
// For each file that declares a component, it reads the component's template and
// the directives its `imports` list gives. It runs compileSource on them: a template
// that does not compile fails the build, with the file, the component and the error.
//
// It also defines the build constant `globalThis.__TINKER_DEV__` (the `dev` option, which
// defaults to Vite's development mode), which core reads into the DEV_MODE token.
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

import { type Either, match, map, type Maybe, run } from "@tinker/functional";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { Class } from "@tinker/core";
import { BUILT_IN_NAMES, compileSource, emitCompiled, type ImportedSelector, namesIn, TemplateCompileError } from "@tinker/core/compiler";
import MagicString from "magic-string";
import type { Plugin } from "vite";
import {
  type Declaration,
  identifiersIn,
  readSource,
  type SourceInfo,
  type TemplateSource,
  textOf,
  type UrlSource,
} from "./declarations.ts";

/** What the check needs from its caller: resolving an import, and reporting. */
export interface CheckHost {
  /** The file an import of `source` from `importer` is, or null when it is not found. */
  resolve(source: string, importer: string): Promise<string | null>;
  /** Fails the build with `message`. */
  error(message: string): never;
  warn(message: string): void;
  /** Rebuilds the component that reads `file` when `file` changes. Optional: Vite passes it. */
  watch?(file: string): void;
}

/** Text to put in place of a range of the source: a template, now its compiled expression. */
export interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** The names the emitted code uses for the helpers, aliased so they cannot clash with the file. */
const HELPERS = { Some: "__tinkerSome", None: "__tinkerNone", Selector: "__tinkerSelector" };
const HELPER_IMPORTS = [
  `import { Some as ${HELPERS.Some}, None as ${HELPERS.None} } from "@tinker/functional";`,
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
  /**
   * Whether the app runs in development mode (DEV_MODE). Defaults to Vite's development mode:
   * off in a production build.
   */
  readonly dev?: boolean;
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
    // Defines the build constant that core reads for DEV_MODE.
    config(_config, env) {
      const dev = options.dev ?? env.mode === "development";
      return { define: { "globalThis.__TINKER_DEV__": JSON.stringify(dev) } };
    },
    async transform(code, id) {
      if (!isSourceWithComponents(code, id)) {
        return null;
      }
      const emitted = await emitFile(code, id, {
        resolve: async (source, importer) => (await this.resolve(source, importer))?.id ?? null,
        error: (message) => this.error(message),
        warn: (message) => this.warn(message),
        watch: (file) => this.addWatchFile(file),
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
  const registrations = registrationsOf(code, filename);
  if (replacements.length === 0 && registrations.length === 0) {
    return undefined;
  }
  const output = new MagicString(code);
  for (const replacement of replacements) {
    output.overwrite(replacement.start, replacement.end, replacement.text);
  }
  for (const registration of registrations) {
    output.appendLeft(registration.start, registration.text);
  }
  if (registrations.length > 0) {
    output.prepend(REGISTER_IMPORT);
  }
  if (replacements.length > 0) {
    output.prepend(HELPER_IMPORTS);
  }
  return {
    code: output.toString(),
    map: output.generateMap({ hires: true, source: filename, includeContent: true }),
  };
}

/** The name the emitted code uses for the input registration, aliased like the other helpers. */
const REGISTER = "__tinkerRegisterInputs";
const REGISTER_IMPORT = `import { registerInputNames as ${REGISTER} } from "@tinker/core";\n`;

/**
 * The registration of each class's input names, placed after the class: the class then knows
 * the names its templates use, without an instance. Given whether or not templates are emitted.
 */
function registrationsOf(code: string, filename: string): Replacement[] {
  return readSource(code, filename).declarations
    .filter(({ inputNames }) => Object.keys(inputNames).length > 0)
    .map((declaration) => ({
      start: declaration.statementEnd,
      end: declaration.statementEnd,
      text: `\n${REGISTER}(${declaration.name}, ${JSON.stringify(declaration.inputNames)});`,
    }));
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
    const style = styleReplacementFor(declaration, filename, host, mode, where);
    if (style !== undefined) {
      replacements.push(style);
    }
    if (declaration.templateUrl !== undefined) {
      const template = await templateUrlReplacementFor(
        declaration,
        declaration.templateUrl,
        source,
        filename,
        host,
        mode,
        where,
      );
      if (template !== undefined) {
        replacements.push(template);
      }
      continue;
    }
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
 * The `styles` a component's `styleUrls` gives: the CSS file's text, in place of the property.
 * Undefined when there is no `styleUrls`.
 */
function styleReplacementFor(
  declaration: Declaration,
  filename: string,
  host: CheckHost,
  mode: CompileMode,
  where: string,
): Replacement | undefined {
  const styleUrls = declaration.styleUrls;
  if (styleUrls === undefined) {
    return undefined;
  }
  if (styleUrls.hasInline) {
    host.error(`${where}: give either styles or styleUrls, not both`);
  }
  if (!styleUrls.isList) {
    host.error(`${where}: styleUrls takes a list of files, like ["./a.css"]`);
  }
  if (styleUrls.urls === undefined) {
    skip(host, mode, where, "its styleUrls is not a literal");
    return undefined;
  }
  // The files are joined in the order they are listed, into one `styles`.
  const css = styleUrls.urls
    .map((url) => readUrlFile(url, "styleUrls", filename, host, where))
    .join("\n");
  return { start: styleUrls.start, end: styleUrls.end, text: `styles: ${JSON.stringify(css)}` };
}

/**
 * The `template` a component's `templateUrl` gives, in place of the property: the file's
 * text, or with `emit` its compiled tree. The file is checked as a template is, and its
 * errors are reported against it. Undefined when the file is skipped.
 */
async function templateUrlReplacementFor(
  declaration: Declaration,
  templateUrl: UrlSource,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
  mode: CompileMode,
  where: string,
): Promise<Replacement | undefined> {
  if (templateUrl.hasInline) {
    host.error(`${where}: give either template or templateUrl, not both`);
  }
  if (templateUrl.urls === undefined) {
    skip(host, mode, where, "its templateUrl is not a literal");
    return undefined;
  }
  if (templateUrl.isList) {
    host.error(`${where}: templateUrl takes one file, as a string`);
  }
  // A string names one file, so its list has one item.
  const html = readUrlFile(templateUrl.urls[0]!, "templateUrl", filename, host, where);
  const compiled = await replacementFor(
    declaration,
    { text: html, start: templateUrl.start, end: templateUrl.end },
    source,
    filename,
    host,
    mode,
  );
  return {
    start: templateUrl.start,
    end: templateUrl.end,
    text: `template: ${compiled?.text ?? JSON.stringify(html)}`,
  };
}

/**
 * The text of a file that a property names, read next to the source file, and watched
 * by the host. Fails the build, naming the property and the file, when it cannot be read.
 */
function readUrlFile(
  url: string,
  option: string,
  filename: string,
  host: CheckHost,
  where: string,
): string {
  const path = resolve(dirname(filename), url);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return host.error(`${where}: cannot read ${option} "${url}": ${(error as Error).message}`);
  }
  host.watch?.(path);
  return text;
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
  checkTemplateFunctions(imports.functions, declaration, where, host);
  // Each import gets a placeholder class named as the file names it, so the emitted
  // expression can refer to it by that name.
  const classes = new Map<Class<object>, string>();
  const list: ImportedSelector[] = imports.selectors.map((imported) => {
    const type = placeholderFor(imported.name);
    classes.set(type, imported.name);
    return { selector: imported.selector, isComponent: imported.isComponent, type,
      ...(imported.exportAs === undefined ? {} : { exportAs: imported.exportAs }) };
  });
  if (declaration.extendsAnother) {
    unchecked(host, mode, where, "it extends another class, so its inherited members are not read");
  }
  return match(compileSource(template.text, list), {
    Left: (error) => host.error(`${where}: ${describe(error, template.text)}`),
    Right: (nodes) => {
      if (!declaration.extendsAnother) {
        checkNames(nodes, declaration, imports.functions, where, host);
      }
      return mode.emit
        ? emitted(template, emitCompiled(nodes, classes, HELPERS), where, host)
        : undefined;
    },
  });
}

/**
 * The names a template reads must be the component's members, names the template declares, its
 * imported template functions, or built-ins. Anything else stops the build: a read the component
 * does not have would only fail at run time.
 */
function checkNames(
  nodes: unknown,
  declaration: Declaration,
  functions: readonly ImportedFunction[],
  where: string,
  host: CheckHost,
): void {
  const names = namesIn(nodes);
  const known = new Set<string>([
    ...declaration.members,
    ...names.declared,
    ...functions.map((fn) => fn.templateName),
    ...BUILT_IN_NAMES,
  ]);
  for (const name of names.read) {
    // A `$` name is a special of the template (`$index`, `$event`), not a member.
    if (!known.has(name) && !name.startsWith("$")) {
      host.error(`${where}: the template reads "${name}", which ${declaration.name} does not have`);
    }
  }
}

/**
 * A component whose names cannot be checked: an error in strict mode, a warning otherwise. Its
 * template is still compiled.
 */
function unchecked(host: CheckHost, mode: CompileMode, where: string, reason: string): void {
  if (mode.strict) {
    host.error(`${where} cannot be checked: ${reason}`);
  }
  host.warn(`${where}: names are not checked: ${reason}`);
}

/** The replacement of the template's text by its compiled expression, or the error stopping it. */
function emitted(
  template: { readonly start: number; readonly end: number },
  result: Either<string, Error>,
  where: string,
  host: CheckHost,
): Replacement | undefined {
  return match(result, {
    Left: (error) => host.error(`${where}: ${error.message}`),
    Right: (text) => ({ start: template.start, end: template.end, text }),
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
  readonly exportAs?: string;
}

/** A template function a component imports: the name in the importing file, and the template's. */
interface ImportedFunction {
  readonly name: string;
  readonly templateName: string;
}

/** The directives and template functions a component imports, or why they cannot be read. */
type ImportsRead
  = | {
    readonly isRead: true;
    readonly selectors: NamedSelector[];
    readonly functions: ImportedFunction[];
  }
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
  const functions: ImportedFunction[] = [];
  for (const name of names) {
    const found = await declarationNamed(name, source, filename, host);
    if (found?.declaration.kind === "templateFunction") {
      const templateName = found.declaration.templateFunctionName;
      if (templateName === undefined) {
        return { isRead: false, reason: `${name} has no literal name` };
      }
      functions.push({ name, templateName });
      continue;
    }
    const selector = await selectorOf(name, source, filename, host);
    if (selector === undefined) {
      return { isRead: false, reason: `${name} has no literal selector, or is not found` };
    }
    selectors.push({ name, ...selector });
  }
  return { isRead: true, selectors, functions };
}

/**
 * The build-time checks of a component's template functions: two imports with one template name
 * are an error, and so is a member of the component with that name, which would hide the function.
 * Both stop the build. A member inherited from a base class is not read here: development mode
 * warns about it at run time.
 */
function checkTemplateFunctions(
  functions: readonly ImportedFunction[],
  declaration: Declaration,
  where: string,
  host: CheckHost,
): void {
  // The built-in names (`flow`) are reserved: no member or import may take one.
  for (const builtIn of BUILT_IN_NAMES) {
    if (declaration.members.includes(builtIn)) {
      host.error(`${where}: the member "${builtIn}" has the name of a built-in template function`);
    }
  }
  const names = new Set<string>();
  for (const { name, templateName } of functions) {
    if (BUILT_IN_NAMES.includes(templateName)) {
      host.error(`${where}: ${name} has the name of a built-in template function: "${templateName}"`);
    }
    if (names.has(templateName)) {
      host.error(`${where}: two imports are template functions named "${templateName}"`);
    }
    names.add(templateName);
    if (declaration.members.includes(templateName)) {
      host.error(`${where}: the member "${templateName}" hides the template function ${name}, imported as "${templateName}"`);
    }
  }
}

/** The selector of the directive `name` as this file sees it: declared here, or imported. */
async function selectorOf(
  name: string,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<Pick<NamedSelector, "selector" | "isComponent"> | undefined> {
  const found = await declarationNamed(name, source, filename, host);
  return found === undefined
    ? undefined
    : selectorInfo(found.declaration, found.source, found.filename, host);
}

/**
 * The declaration `name` refers to in this file: declared here, or imported and exported by its
 * file.
 */
async function declarationNamed(
  name: string,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<FoundDeclaration | undefined> {
  const local = source.declarations.find((declaration) => declaration.name === name);
  if (local !== undefined) {
    return { declaration: local, source, filename };
  }
  const binding = source.imports.find((imported) => imported.local === name);
  if (binding === undefined) {
    return undefined;
  }
  const file = await host.resolve(binding.source, filename);
  return file === null
    ? undefined
    : exportedDeclaration(binding.imported, file, host, new Set());
}

/** A declaration found by its exported name, with the file that declares it. */
interface FoundDeclaration {
  readonly declaration: Declaration;
  readonly source: SourceInfo;
  readonly filename: string;
}

/**
 * The declaration that `file` exports as `exported`: declared there, or re-exported from another
 * file (`export { X } from "..."`, or `export * from "..."`). `seen` stops a cycle of re-exports.
 */
async function exportedDeclaration(
  exported: string,
  file: string,
  host: CheckHost,
  seen: Set<string>,
): Promise<FoundDeclaration | undefined> {
  const key = `${file}\0${exported}`;
  if (seen.has(key)) {
    return undefined;
  }
  seen.add(key);
  const source = readSource(readFileSync(file, "utf8"), file);
  const declaration = source.declarations.find((candidate) => candidate.name === exported);
  if (declaration !== undefined) {
    return { declaration, source, filename: file };
  }
  const named = source.reexports.find((reexport) => reexport.local === exported);
  const candidates = named === undefined
    ? source.starExports.map((from) => ({ from, name: exported }))
    : [{ from: named.source, name: named.imported }];
  for (const { from, name } of candidates) {
    const next = await host.resolve(from, file);
    const found = next === null ? undefined : await exportedDeclaration(name, next, host, seen);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
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
): Promise<Pick<NamedSelector, "selector" | "isComponent" | "exportAs"> | undefined> {
  // An exportAs that is not a literal cannot be read here: the template is compiled at run time.
  if (declaration.exportAsIsDynamic) {
    return undefined;
  }
  const selector = declaration.selector
    ?? (declaration.selectorName === undefined
      ? undefined
      : await constantValue(declaration.selectorName, source, filename, host));
  if (selector === undefined) {
    return undefined;
  }
  return { selector, isComponent: declaration.kind === "component", exportAs: declaration.exportAs };
}
