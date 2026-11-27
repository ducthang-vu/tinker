// `tinker generate <kind> <name>`: writes a new file for a component, a directive, a service or a
// template function, at src/<name>/<name>.ts, and registers it in the root component of the app
// (src/app.ts): an import, and an entry in its `imports`. A service needs no registration, since
// it is provided in the root injector. Everything is checked before anything is written, so an
// app that cannot be registered in is left as it was. A plan writes nothing until it is applied.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NAME_PATTERN } from "./new.ts";
import { DEFAULT_TEST_RUNNER, type TestRunner } from "./templates.ts";

/** What can be generated. */
export const KINDS = ["component", "directive", "service", "function"] as const;
export type Kind = (typeof KINDS)[number];

/** A file to create: its path relative to the app, and its content. */
export interface NewFile {
  readonly path: string;
  readonly content: string;
}

/** The files of an item, and its class name (when the root component registers it). */
export interface Generated {
  readonly files: readonly NewFile[];
  /** The class to register in the root component's `imports`; absent for a service. */
  readonly className?: string;
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

/** The file of an item of each kind, for a name and the app's prefix. */
export function generated(
  kind: Kind,
  name: string,
  prefix: string,
  testRunner: TestRunner = DEFAULT_TEST_RUNNER,
): Generated {
  const path = `src/${name}/${name}.ts`;
  const Class = pascal(name);
  switch (kind) {
    case "component":
      return {
        files: [
          {
            path,
            content: `import { Component } from "@tinker/core";

@Component({
  selector: "${prefix}-${name}",
  template: \`<p>${Class} works</p>\`,
})
export class ${Class}Component {}
`,
          },
          {
            path: `src/${name}/${name}.test.ts`,
            content: testRunner === "node"
              ? `import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ${Class}Component } from "./${name}.ts";

describe("${Class}Component", () => {
  test("is created", () => {
    assert.ok(new ${Class}Component() instanceof ${Class}Component);
  });
});
`
              : `import { describe, expect, test } from "vitest";
import { ${Class}Component } from "./${name}.ts";

describe("${Class}Component", () => {
  test("is created", () => {
    expect(new ${Class}Component()).toBeInstanceOf(${Class}Component);
  });
});
`,
          },
        ],
        className: `${Class}Component`,
      };
    case "directive":
      return {
        files: [{ path, content: `import { Directive } from "@tinker/core";

@Directive({ selector: "[${prefix}-${name}]" })
export class ${Class}Directive {}
` }],
        className: `${Class}Directive`,
      };
    case "service":
      return {
        files: [{ path, content: `import { Injectable } from "@tinker/core";

@Injectable({ providedIn: "root" })
export class ${Class}Service {}
` }],
      };
    case "function":
      return {
        files: [{ path, content: `import { TemplateFunction, type TemplateFunctionContract } from "@tinker/core";

@TemplateFunction("${camel(name)}")
export class ${Class}Function implements TemplateFunctionContract<[unknown], string> {
  call(value: unknown): string {
    return String(value);
  }
}
` }],
        className: `${Class}Function`,
      };
  }
}

/**
 * The settings of the app in `root`, from its package.json: its selector prefix, and its test
 * runner (vitest when the app says none). Throws when the folder is not a Tinker app.
 */
export function settingsOf(root: string): { prefix: string; testRunner: TestRunner } {
  const file = join(root, "package.json");
  const manifest = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as { tinker?: { prefix?: unknown; testRunner?: unknown } })
    : {};
  const prefix = manifest.tinker?.prefix;
  if (typeof prefix !== "string") {
    throw new Error("This is not a Tinker app: its package.json has no tinker.prefix. Run tinker generate in an app folder");
  }
  const testRunner = manifest.tinker?.testRunner ?? DEFAULT_TEST_RUNNER;
  if (testRunner !== "vitest" && testRunner !== "node") {
    throw new Error(`"${String(testRunner)}" is not a test runner of this app: use vitest or node`);
  }
  return { prefix, testRunner };
}

/** The prefix of the app in `root`, from its package.json. Throws when it is not a Tinker app. */
export function prefixOf(root: string): string {
  return settingsOf(root).prefix;
}

/**
 * Adds the import of `className` and its entry in the root component's `imports`. The root
 * component is the `@Component({ … })` of `source`, which may already have an `imports` list.
 * Throws when that cannot be done, so the app is left as it was.
 */
export function register(source: string, className: string, importPath: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.startsWith("@Component({"));
  if (start === -1) {
    throw new Error("src/app.ts has no @Component({ … }) to register the item in");
  }
  const end = lines.findIndex((line, index) => index > start && /^\}\);?$/.test(line));
  if (end === -1) {
    throw new Error("src/app.ts: its @Component decorator does not close on its own line");
  }
  const listAt = lines.findIndex((line, index) => index > start && index < end && line.includes("imports:"));
  if (listAt === -1) {
    lines.splice(end, 0, `  imports: [${className}],`);
  } else {
    const list = /imports:\s*\[([^\]]*)\]/.exec(lines[listAt]!);
    if (list === null) {
      throw new Error("src/app.ts: its imports list spans lines, so the item must be added by hand");
    }
    const inner = list[1]!.trim();
    lines[listAt] = lines[listAt]!.replace(list[0], `imports: [${inner === "" ? className : `${inner}, ${className}`}]`);
  }
  const lastImport = lines.reduce((found, line, index) => (line.startsWith("import ") ? index : found), -1);
  lines.splice(lastImport + 1, 0, `import { ${className} } from "${importPath}";`);
  return lines.join("\n");
}

/** What `generate` will do: the files to create, and the new src/app.ts, if it changes. */
export interface Plan {
  readonly files: readonly NewFile[];
  readonly app?: { readonly path: string; readonly content: string };
}

/**
 * Plans the item of `kind` and `name` in the app in `root`: the files to create, and the root
 * component's new content. Writes nothing. Throws when the kind or the name is not valid, the item
 * exists, or the root component cannot be registered in.
 */
export function plan(root: string, kind: string, name: string): Plan {
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
  const settings = settingsOf(root);
  const item = generated(kind as Kind, name, settings.prefix, settings.testRunner);
  if (item.className === undefined) {
    return { files: item.files };
  }
  const appPath = join(root, "src", "app.ts");
  if (!existsSync(appPath)) {
    throw new Error("There is no src/app.ts to register the item in");
  }
  const content = register(readFileSync(appPath, "utf8"), item.className, `./${name}/${name}.ts`);
  return { files: item.files, app: { path: "src/app.ts", content } };
}

/** Writes a plan into the app in `root`. */
export function apply(root: string, planned: Plan): void {
  for (const file of planned.files) {
    const target = join(root, file.path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, file.content);
  }
  if (planned.app !== undefined) {
    writeFileSync(join(root, planned.app.path), planned.app.content);
  }
}
