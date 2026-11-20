// A Vite plugin that checks the templates of an app's components at build time.
//
// For each file that declares a component, it reads the component's template and
// the directives its `imports` list gives, and runs compileSource on them. A
// template that does not compile fails the build, with the file, the component
// and the error. The file itself is not changed: the check only reports.
//
// A component is skipped, with a warning, when something it needs is not
// written as a literal (its template, its `imports` or a directive's selector),
// or when an imported directive cannot be found. Nothing is checked at run time.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { compileSource, type ImportedSelector } from "@tinker/core/compiler";
import type { Plugin } from "vite";
import { type Declaration, readSource, type SourceInfo } from "./declarations.ts";

/** What the check needs from its caller: resolving an import, and reporting. */
export interface CheckHost {
  /** The file an import of `source` from `importer` is, or null when it is not found. */
  resolve(source: string, importer: string): Promise<string | null>;
  /** Fails the build with `message`. */
  error(message: string): never;
  warn(message: string): void;
}

/** The plugin: checks the templates of components in each source file it transforms. */
export function tinkerCompiler(): Plugin {
  return {
    name: "tinker:compile-check",
    enforce: "pre",
    async transform(code, id) {
      if (isSourceWithComponents(code, id)) {
        await checkComponents(code, id, {
          resolve: async (source, importer) => (await this.resolve(source, importer))?.id ?? null,
          error: (message) => this.error(message),
          warn: (message) => this.warn(message),
        });
      }
      return null;
    },
  };
}

/** Whether `id` is a TypeScript file outside node_modules that mentions a component. */
function isSourceWithComponents(code: string, id: string): boolean {
  return /\.[cm]?tsx?$/.test(id)
    && !id.includes("node_modules")
    && /@(Component|Directive)\b/.test(code);
}

/** Checks every component declared in `code`, failing through `host` on the first error. */
export async function checkComponents(
  code: string,
  filename: string,
  host: CheckHost,
): Promise<void> {
  const source = readSource(code, filename);
  for (const declaration of source.declarations) {
    if (declaration.kind === "component" && declaration.template !== undefined) {
      await checkComponent(declaration, declaration.template, source, filename, host);
    }
  }
}

async function checkComponent(
  declaration: Declaration,
  template: string,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<void> {
  const where = `${basename(filename)}: <${declaration.name}>`;
  const imports = await importedSelectors(declaration.imports, source, filename, host);
  if (!imports.isRead) {
    host.warn(`${where} is not checked: ${imports.reason}`);
    return;
  }
  compileSource(template, imports.selectors)
    .match({
      left: (error) => host.error(`${where}: ${error.message}`),
      right: () => undefined,
    });
}

/** The selectors of the directives a component imports, or why they cannot be read. */
type ImportsRead
  = | { readonly isRead: true; readonly selectors: ImportedSelector[] }
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
  const selectors: ImportedSelector[] = [];
  for (const name of names) {
    const selector = await selectorOf(name, source, filename, host);
    if (selector === undefined) {
      return { isRead: false, reason: `${name} has no literal selector, or is not found` };
    }
    selectors.push(selector);
  }
  return { isRead: true, selectors };
}

/** The selector of the directive `name` as this file sees it: declared here, or imported. */
async function selectorOf(
  name: string,
  source: SourceInfo,
  filename: string,
  host: CheckHost,
): Promise<ImportedSelector | undefined> {
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

function selectorInfo(declaration: Declaration): ImportedSelector | undefined {
  if (declaration.selector === undefined) {
    return undefined;
  }
  return { selector: declaration.selector, isComponent: declaration.kind === "component" };
}
