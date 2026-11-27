import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkFileNameOf, checkHostFor, sourceFilesUnder, writeChecks } from "./write-checks.ts";

/** A temporary folder, with the files given (relative paths to their text). */
function folderWith(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), "tinker-types-"));
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
  }
  return folder;
}

/** Output lines collected, for the writer's messages. */
function output() {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    log: (line: string) => lines.push(line),
    error: (line: string) => errors.push(line),
  };
}

const page = `import { Component } from "@tinker/core";
@Component({ selector: "tk-page", template: "<p>{{ title }}</p>" })
export class Page {
  readonly title = "x";
}
`;

describe("checkFileNameOf", () => {
  test("the check file is next to the source, named after it", () => {
    expect(checkFileNameOf("/app/page.ts"))
      .toBe("/app/page.template-check.ts");
  });
});

describe("sourceFilesUnder", () => {
  test("finds the source files under a folder, and skips declarations, tests, builds and dependencies", () => {
    const folder = folderWith({
      "a.ts": "",
      "a.d.ts": "",
      "a.test.ts": "",
      "a.template-check.ts": "",
      "style.css": "",
      "dist/b.ts": "",
      "node_modules/c.ts": "",
      "sub/d.ts": "",
    });
    const found = sourceFilesUnder([folder])
      .map((file) => file.slice(folder.length + 1))
      .sort();
    expect(found)
      .toEqual(["a.ts", join("sub", "d.ts")].sort());
  });

  test("a file given is taken as it is, when it is a source file", () => {
    const folder = folderWith({ "a.ts": "", "b.css": "" });
    expect(sourceFilesUnder([join(folder, "a.ts"), join(folder, "b.css")]))
      .toEqual([join(folder, "a.ts")]);
  });
});

describe("writeChecks", () => {
  test("writes the check file of an exported component", async () => {
    const folder = folderWith({ "page.ts": page });
    const out = output();
    expect(await writeChecks([join(folder, "page.ts")], out))
      .toBe(0);
    const written = readFileSync(join(folder, "page.template-check.ts"), "utf8");
    expect(written)
      .toContain("export function check_Page($c: Page): void {");
    expect(written)
      .toContain("void ($c[\"title\"]);");
    expect(out.lines)
      .toEqual(["Wrote 1 type check file(s)."]);
  });

  test("a component whose class is not exported is not checked: a warning, and no file", async () => {
    const folder = folderWith({ "page.ts": page.replace("export class", "class") });
    const out = output();
    await writeChecks([join(folder, "page.ts")], out);
    expect(out.errors)
      .toEqual(["warning: Page is not exported, so its template is not type checked"]);
    expect(existsSync(join(folder, "page.template-check.ts")))
      .toBe(false);
  });

  test("a check file left from a file with no checkable component is removed", async () => {
    const folder = folderWith({
      "page.ts": `export class Plain {}\n`,
      "page.template-check.ts": "stale",
    });
    await writeChecks([join(folder, "page.ts")], output());
    expect(existsSync(join(folder, "page.template-check.ts")))
      .toBe(false);
  });

  test("a file with no check file and no components is left alone", async () => {
    const folder = folderWith({ "plain.ts": "export class Plain {}\n" });
    const out = output();
    await writeChecks([join(folder, "plain.ts")], out);
    expect(existsSync(join(folder, "plain.template-check.ts")))
      .toBe(false);
  });

  test("a template that is not a literal, or a templateUrl, is not checked", async () => {
    const folder = folderWith({
      "computed.ts": `@Component({ selector: "tk-a", template: build() }) export class A {}\n`,
      "external.ts": `@Component({ selector: "tk-b", templateUrl: "./b.html" }) export class B {}\n`,
    });
    const out = output();
    await writeChecks([join(folder, "computed.ts"), join(folder, "external.ts")], out);
    expect(existsSync(join(folder, "computed.template-check.ts")))
      .toBe(false);
    expect(existsSync(join(folder, "external.template-check.ts")))
      .toBe(false);
  });

  test("a template function imported from another file is imported by the check", async () => {
    const folder = folderWith({
      "format.ts": `import { TemplateFunction } from "@tinker/core";
@TemplateFunction("format")
export class Format {
  call(n: number): string {
    return String(n);
  }
}
`,
      "page.ts": `import { Component } from "@tinker/core";
import { Format } from "./format.ts";
@Component({ selector: "tk-page", template: "<p>{{ format(1) }}</p>", imports: [Format] })
export class Page {}
`,
    });
    const out = output();
    expect(await writeChecks([join(folder, "page.ts")], out))
      .toBe(0);
    const written = readFileSync(join(folder, "page.template-check.ts"), "utf8");
    expect(written)
      .toContain("import { Format as $cls_0 } from \"./format.ts\";");
    expect(written)
      .toContain("$fn_format.call(1)");
  });

  test("a file that cannot be read fails the command, with its message", async () => {
    const out = output();
    const folder = folderWith({});
    expect(await writeChecks([join(folder, "missing.ts")], out))
      .toBe(1);
    expect(out.errors)
      .toHaveLength(1);
    expect(out.lines)
      .toEqual(["The type check files could not all be written."]);
  });
});

describe("checkHostFor", () => {
  test("a warning goes to the output, prefixed", async () => {
    const out = output();
    checkHostFor(out)
      .warn("a thing is not read");
    expect(out.errors)
      .toEqual(["warning: a thing is not read"]);
  });

  test("an error ends the check by throwing its message", () => {
    expect(() => checkHostFor(output())
      .error("bad"))
      .toThrow("bad");
  });

  test("an import is resolved, and a missing one gives null", async () => {
    const folder = folderWith({ "a.ts": "" });
    const host = checkHostFor(output());
    expect(await host.resolve("./a.ts", join(folder, "page.ts")))
      .toBe(join(folder, "a.ts"));
    expect(await host.resolve("./missing.ts", join(folder, "page.ts")))
      .toBeNull();
  });
});
