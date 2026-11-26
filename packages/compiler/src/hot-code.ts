// The development-only hot reload code the plugin adds to a module that declares components.
// It is added only when Vite serves the app: a build never gets it, so it is not in the bundle.
// The fingerprint is the module's code without its templates, so a change of only a template
// keeps it the same, and a change of anything else does not.

import { readSource } from "./declarations.ts";

/**
 * The hot reload code for a module that declares components, or undefined when it declares none.
 *
 * @param code The module's source, as written (before its templates are compiled).
 * @param file The module's file.
 * @returns A statement calling `__tinkerHot` when the module is loaded with Vite's hot API.
 */
export function hotCodeFor(code: string, file: string): string | undefined {
  const source = readSource(code, file);
  const components = source.declarations.filter((declaration) => declaration.kind === "component");
  if (components.length === 0) {
    return undefined;
  }
  const templates = source.declarations.flatMap((declaration) =>
    declaration.template === undefined ? [] : [declaration.template]);
  const names = components.map((declaration) => `[${JSON.stringify(declaration.name)}, ${declaration.name}]`);
  return [
    `import { __tinkerHot } from "@tinker/core/hot";`,
    "if (import.meta.hot) {",
    // Vite reads this statically: a module that accepts its own updates has this call.
    "  import.meta.hot.accept();",
    `  __tinkerHot(import.meta.hot, ${JSON.stringify(file)}, ${JSON.stringify(fingerprintOf(code, templates))}, [${names.join(", ")}]);`,
    "}",
  ].join("\n");
}

/** The fingerprint of `code` without the text of its templates. */
export function fingerprintOf(
  code: string,
  templates: readonly { readonly start: number; readonly end: number }[],
): string {
  let rest = "";
  let last = 0;
  for (const template of [...templates].sort((a, b) => a.start - b.start)) {
    rest += code.slice(last, template.start);
    last = template.end;
  }
  return hash(rest + code.slice(last));
}

/** FNV-1a, as hex: small, and the same for the same text. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16);
}
