// `tinker generate <kind> <name>`: writes one new file for a component, a directive, a service or
// a template function, at src/<name>/<name>.ts in the app. The selector prefix comes from the
// app's package.json (tinker.prefix). Nothing that exists is changed: the command prints the line
// that uses the new item, for the user to paste where it is needed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NAME_PATTERN } from "./new.ts";

/** What can be generated. */
export const KINDS = ["component", "directive", "service", "function"] as const;
export type Kind = (typeof KINDS)[number];

/** A generated file, and the line that uses it. */
export interface Generated {
  /** The path of the file, relative to the app's folder. */
  readonly path: string;
  readonly content: string;
  /** What to paste where the item is used. */
  readonly usage: string;
}

/** The class name of a dash-separated name: `user-card` is `UserCard`. */
function pascal(name: string): string {
  return name.split("-")
    .map((part) => part.charAt(0)
      .toUpperCase() + part.slice(1))
    .join("");
}

/** The function name of a dash-separated name: `format-price` is `formatPrice`. */
function camel(name: string): string {
  const [first = "", ...rest] = name.split("-");
  return first + rest.map((part) => part.charAt(0)
    .toUpperCase() + part.slice(1))
    .join("");
}

/** The file of each kind, for a name and the app's prefix. */
export function generated(kind: Kind, name: string, prefix: string): Generated {
  const path = `src/${name}/${name}.ts`;
  const Class = pascal(name);
  const usedFrom = `import { ${Class}Component } from "./${name}/${name}.ts";`;
  switch (kind) {
    case "component":
      return {
        path,
        content: `import { Component } from "@tinker/core";

@Component({
  selector: "${prefix}-${name}",
  template: \`<p>${Class} works</p>\`,
})
export class ${Class}Component {}
`,
        usage: `${usedFrom}\n// then add ${Class}Component to the imports of the component that shows it`,
      };
    case "directive":
      return {
        path,
        content: `import { Directive } from "@tinker/core";

@Directive({ selector: "[${prefix}-${name}]" })
export class ${Class}Directive {}
`,
        usage: `import { ${Class}Directive } from "./${name}/${name}.ts";\n// then add ${Class}Directive to the imports of the component whose template uses it`,
      };
    case "service":
      return {
        path,
        content: `import { Injectable } from "@tinker/core";

@Injectable({ providedIn: "root" })
export class ${Class}Service {}
`,
        usage: `import { inject } from "@tinker/core";\nimport { ${Class}Service } from "./${name}/${name}.ts";\n// in a class: private readonly ${camel(name)} = inject(${Class}Service);`,
      };
    case "function":
      return {
        path,
        content: `import { TemplateFunction, type TemplateFunctionContract } from "@tinker/core";

@TemplateFunction("${camel(name)}")
export class ${Class}Function implements TemplateFunctionContract<[unknown], string> {
  call(value: unknown): string {
    return String(value);
  }
}
`,
        usage: `import { ${Class}Function } from "./${name}/${name}.ts";\n// then add ${Class}Function to the imports of the component whose template calls ${camel(name)}()`,
      };
  }
}

/** The prefix of the app in `root`, from its package.json. Throws when it is not a Tinker app. */
export function prefixOf(root: string): string {
  const file = join(root, "package.json");
  const manifest = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as { tinker?: { prefix?: unknown } })
    : {};
  const prefix = manifest.tinker?.prefix;
  if (typeof prefix !== "string") {
    throw new Error("This is not a Tinker app: its package.json has no tinker.prefix. Run tinker generate in an app folder");
  }
  return prefix;
}

/**
 * Writes the file of a new item into the app in `root`, and returns it. Throws when the kind or the
 * name is not valid, or the item already exists.
 */
export function generateInto(root: string, kind: string, name: string): Generated {
  if (!(KINDS as readonly string[]).includes(kind)) {
    throw new Error(`"${kind}" is not a kind to generate: use ${KINDS.join(", ")}`);
  }
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`"${name}" is not a valid name: use lower case letters, digits and dashes`);
  }
  const folder = join(root, "src", name);
  if (existsSync(folder)) {
    throw new Error(`${folder} already exists`);
  }
  const file = generated(kind as Kind, name, prefixOf(root));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(root, file.path), file.content);
  return file;
}
