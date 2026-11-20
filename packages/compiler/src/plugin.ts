// A Vite plugin that compiles the templates of an app's components at build time.
//
// For each file that declares a component, it reads the component's template and
// the directives its `imports` list gives. It runs compileSource on them: a template
// that does not compile fails the build, with the file, the component and the error.
// A template that compiles is replaced in the file by the expression that rebuilds
// its compiled tree (emitCompiled), so the component skips the parser and the
// compiler at run time. The file's helper imports are added at its top, under names
// that cannot clash with its own.
//
// A component is skipped, with a warning, when something it needs is not written as
// a literal (its template, its `imports` or a directive's selector), or when an
// imported directive cannot be found. Such a component keeps its template string.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Class } from "@tinker/core";
import { compileSource, type ImportedSelector, emitCompiled } from "@tinker/core/compiler";
import MagicString from "magic-string";
import type { Plugin } from "vite";
import { type Declaration, readSource, type SourceInfo, type TemplateSource } from "./declarations.ts";

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

/** The plugin: compiles the templates of components in each source file it transforms. */
export function tinkerCompiler(): Plugin {
  return {
    name: "tinker:compile-templates",
    enforce: "pre",
    async transform(code, id) {
      if (!isSourceWithComponents(code, id)) {
        return null;
      }
      const replacements = await compileComponents(code, id, {
        resolve: async (source, importer) => (await this.resolve(source, importer))?.id ?? null,
        error: (message) => this.error(message),
        warn: (message) => this.warn(message),
      });
      if (replacements.length === 0) {
        return null;
      }
      const output = new MagicString(code);
      for (const replacement of replacements) {
        output.overwrite(replacement.start, replacement.end, replacement.text);
      }
      output.prepend(HELPER_IMPORTS);
      return {
        code: output.toString(),
        map: output.generateMap({ hires: true, source: id, includeContent: true }),
      };
    },
  };
}

/** Whether `id` is a TypeScript file outside node_modules that mentions a component. */
function isSourceWithComponents(code: string, id: string): boolean {
  return /\.[cm]?tsx?$/.test(id)
    && !id.includes("node_modules")
    && /@(Component|Directive)\b/.test(code);
}

/** Compiles every component declared in `code`. Fails through `host` on the first error. */
export async function compileComponents(
  code: string,
  filename: string,
  host: CheckHost,
): Promise<Replacement[]> {
  const source = readSource(code, filename);
  const replacements: Replacement[] = [];
  for (const declaration of source.declarations) {
    if (declaration.kind === "component" && declaration.template !== undefined) {
      const replacement = await replacementFor(
        declaration,
        declaration.template,
        source,
        filename,
        host,
      );
      if (replacement !== undefined) {
        replacements.push(replacement);
      }
    }
  }
  return replacements;
}

async function replacementFor(
  declaration: Declaration,
  template: TemplateSource,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<Replacement | undefined> {
  const where = `${basename(filename)}: <${declaration.name}>`;
  const imports = await importedSelectors(declaration.imports, source, filename, host);
  if (!imports.isRead) {
    host.warn(`${where} is not compiled: ${imports.reason}`);
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
      left: (error) => host.error(`${where}: ${error.message}`),
      right: (nodes) => ({
        start: template.start,
        end: template.end,
        text: emitCompiled(nodes, classes, HELPERS),
      }),
    });
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
    return selectorInfo(local);
  }
  const binding = source.imports.find((imported) => imported.local === name);
  if (binding === undefined) {
    return undefined;
  }
  const file = await host.resolve(binding.source, filename);
  if (file === null) {
    return undefined;
  }
  const declared = readSource(readFileSync(file, "utf8"), file)
    .declarations.find((declaration) => declaration.name === binding.imported);
  return declared === undefined ? undefined : selectorInfo(declared);
}

function selectorInfo(
  declaration: Declaration,
): Pick<NamedSelector, "selector" | "isComponent"> | undefined {
  if (declaration.selector === undefined) {
    return undefined;
  }
  return { selector: declaration.selector, isComponent: declaration.kind === "component" };
}
