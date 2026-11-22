import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { Plugin } from "vite";
import { compileComponents, type CheckHost, type CompilerOptions, tinkerCompiler } from "./plugin.ts";

const fixture = (name: string) => resolve("packages/compiler/test/fixtures", name);

/** A host that records what it is told, and fails the build like Vite does. */
function recordingHost(files: Record<string, string> = {}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const host: CheckHost = {
    resolve: async (source) => files[source] ?? null,
    error: (message) => {
      errors.push(message);
      throw new Error(message);
    },
    warn: (message) => {
      warnings.push(message);
    },
  };
  return { host, errors, warnings };
}

/** Runs the plugin's transform as Vite would, with a context that resolves `files`. */
function transform(
  code: string,
  id: string,
  files: Record<string, string> = {},
  options: CompilerOptions = {},
) {
  const plugin = tinkerCompiler(options);
  const hook = plugin.transform as (
    this: unknown,
    code: string,
    id: string,
  ) => Promise<unknown>;
  const context = {
    resolve: vi.fn(async (source: string) =>
      (files[source] === undefined ? null : { id: files[source] })),
    error: (message: string): never => {
      throw new Error(message);
    },
    warn: vi.fn(),
  };
  return { result: hook.call(context, code, id), context };
}

describe("tinkerCompiler", () => {
  test("is a pre-stage plugin named for the check", () => {
    const plugin = tinkerCompiler() as Plugin & { enforce?: string };
    expect(plugin.name)
      .toBe("tinker:compile-templates");
    expect(plugin.enforce)
      .toBe("pre");
  });

  test("leaves a template that compiles as it is, by default", async () => {
    const { result } = transform(`@Component({ selector: "tk-a", template: "<p>ok</p>" }) class A {}`, "/app/a.ts");
    await expect(result)
      .resolves
      .toBeNull();
  });

  test("with emit, replaces a template that compiles with its compiled expression, and adds the helpers", async () => {
    const { result } = transform(
      `@Component({ selector: "tk-a", template: "<p>ok</p>" }) class A {}`,
      "/app/a.ts",
      {},
      { emit: true },
    );
    const output = (await result) as { code: string; map: unknown };
    expect(output.code)
      .toContain(`import { Maybe as __tinkerMaybe } from "@tinker/functional";`);
    expect(output.code)
      .toContain(`"kind": "element"`);
    expect(output.code)
      .not.toContain(`"<p>ok</p>"`);
    expect(output.map)
      .not.toBeNull();
  });

  test("ignores files that are not TypeScript, that are in node_modules, or with no component", async () => {
    const broken = `@Component({ template: "<p>{{ a + }}</p>" }) class A {}`;
    for (const id of ["/app/style.css", "/app/node_modules/lib/a.ts", "/app/plain.ts"]) {
      const code = id.endsWith("plain.ts") ? "export const x = 1;" : broken;
      await expect(transform(code, id).result)
        .resolves
        .toBeNull();
    }
  });

  test("fails the build with the file, the component and the error", async () => {
    const { result } = transform(`@Component({ selector: "tk-a", template: "<p>{{ a + }}</p>" }) class A {}`, "/app/a.ts");
    await expect(result)
      .rejects
      .toThrow("a.ts: <A>: ");
  });

  test("checks a template with an imported directive, found through resolve", async () => {
    const code = `
      import { Item } from "./item.ts";
      @Component({ selector: "tk-a", template: "<div item>ok</div>", imports: [Item] }) class A {}
    `;
    const { result } = transform(code, "/app/a.tsx", { "./item.ts": fixture("item.ts") });
    await expect(result)
      .resolves
      .toBeNull();
  });

  test("warns, and does not check, when an import cannot be resolved", async () => {
    const code = `
      import { Missing } from "./missing.ts";
      @Component({ template: "<p>{{ a + }}</p>", imports: [Missing] }) class A {}
    `;
    const { result, context } = transform(code, "/app/a.ts");
    await expect(result)
      .resolves
      .toBeNull();
    expect(context.warn)
      .toHaveBeenCalledWith(expect.stringContaining("Missing has no literal selector, or is not found"));
  });
});

describe("compileComponents", () => {
  test("passes a component whose template and directives compile", async () => {
    const { host, errors, warnings } = recordingHost({ "./item.ts": fixture("item.ts") });
    await compileComponents(`
      import { Item } from "./item.ts";
      @Component({ selector: "tk-a", template: "<p item>{{ x() }}</p>", imports: [Item] }) class A {}
    `, "/app/a.ts", host);
    expect(errors)
      .toEqual([]);
    expect(warnings)
      .toEqual([]);
  });

  test("fails for a template that does not parse", async () => {
    const { host, errors } = recordingHost();
    await expect(compileComponents(`@Component({ template: "<div>" }) class A {}`, "/app/a.ts", host))
      .rejects
      .toThrow();
    expect(errors[0])
      .toBe("a.ts: <A>: 1:1: <div> is never closed");
  });

  test("checks a directive declared in the same file, by its name", async () => {
    const { host, errors } = recordingHost();
    await compileComponents(`
      @Directive({ selector: "[local]" }) class Local {}
      @Component({ template: "<p local>{{ a + }}</p>", imports: [Local] }) class A {}
    `, "/app/a.ts", host)
      .catch(() => undefined);
    expect(errors)
      .toHaveLength(1);
  });

  test("passes a component that imports a component, as a child", async () => {
    const { host, errors } = recordingHost({ "./item.ts": fixture("item.ts") });
    await compileComponents(`
      import { Card } from "./item.ts";
      @Component({ template: "<tk-card></tk-card>", imports: [Card] }) class A {}
    `, "/app/a.ts", host);
    expect(errors)
      .toEqual([]);
  });

  test("warns about a component whose template is not a literal, and checks nothing", async () => {
    const { host, errors, warnings } = recordingHost();
    await compileComponents(`@Component({ template: html }) class A {}`, "/app/a.ts", host);
    expect(errors)
      .toEqual([]);
    expect(warnings)
      .toEqual(["a.ts: <A> is not compiled: its template is not a literal"]);
  });

  test("in strict mode, a component that cannot be checked is an error", async () => {
    const { host, errors } = recordingHost();
    await expect(compileComponents(`@Component({ template: html }) class A {}`, "/app/a.ts", host, {
      emit: false,
      strict: true,
    }))
      .rejects
      .toThrow();
    expect(errors)
      .toEqual(["a.ts: <A> cannot be checked: its template is not a literal"]);
  });

  test("in strict mode, imports that are not a list of names are an error", async () => {
    const { host, errors } = recordingHost();
    await expect(compileComponents(`@Component({ template: "<p></p>", imports: list }) class A {}`, "/app/a.ts", host, {
      emit: false,
      strict: true,
    }))
      .rejects
      .toThrow();
    expect(errors)
      .toEqual(["a.ts: <A> cannot be checked: its imports are not a list of names"]);
  });

  test("in strict mode, an import that is not found is an error", async () => {
    const { host, errors } = recordingHost();
    await expect(compileComponents(`@Component({ template: "<p></p>", imports: [Nowhere] }) class A {}`, "/app/a.ts", host, {
      emit: false,
      strict: true,
    }))
      .rejects
      .toThrow();
    expect(errors)
      .toEqual(["a.ts: <A> cannot be checked: Nowhere has no literal selector, or is not found"]);
  });

  test("skips a component whose imports are not a list of names, with a warning", async () => {
    const { host, warnings } = recordingHost();
    await compileComponents(`@Component({ template: "<p></p>", imports: list }) class A {}`, "/app/a.ts", host);
    expect(warnings)
      .toEqual(["a.ts: <A> is not compiled: its imports are not a list of names"]);
  });

  test("warns when an imported name is not imported or declared here", async () => {
    const { host, warnings } = recordingHost();
    await compileComponents(`@Component({ template: "<p></p>", imports: [Nowhere] }) class A {}`, "/app/a.ts", host);
    expect(warnings)
      .toEqual(["a.ts: <A> is not compiled: Nowhere has no literal selector, or is not found"]);
  });

  test("warns when the imported file does not declare the name", async () => {
    const { host, warnings } = recordingHost({ "./item.ts": fixture("item.ts") });
    await compileComponents(`
      import { Nothing } from "./item.ts";
      @Component({ template: "<p></p>", imports: [Nothing] }) class A {}
    `, "/app/a.ts", host);
    expect(warnings)
      .toHaveLength(1);
  });

  test("warns when a directive's selector is not a literal", async () => {
    const { host, warnings } = recordingHost({ "./no-selector.ts": fixture("no-selector.ts") });
    await compileComponents(`
      import { Computed } from "./no-selector.ts";
      @Component({ template: "<p></p>", imports: [Computed] }) class A {}
    `, "/app/a.ts", host);
    expect(warnings)
      .toHaveLength(1);
  });

  test("warns when a local directive has no literal selector", async () => {
    const { host, warnings } = recordingHost();
    await compileComponents(`
      @Directive({ selector: sel }) class Local {}
      @Component({ template: "<p></p>", imports: [Local] }) class A {}
    `, "/app/a.ts", host);
    expect(warnings)
      .toHaveLength(1);
  });

  test("does not check a directive as a component", async () => {
    const { host, errors } = recordingHost();
    await compileComponents(`@Directive({ selector: "[a]", template: "<p>{{ a + }}</p>" }) class A {}`, "/app/a.ts", host);
    expect(errors)
      .toEqual([]);
  });

  describe("constants", () => {
    test("a template named by a constant of the file is checked, with its place in the file", async () => {
      const { host, errors } = recordingHost();
      await expect(compileComponents(`
      const broken = "<p>{{ a + }}</p>";
      @Component({ template: broken }) class A {}
    `, "/app/a.ts", host))
        .rejects
        .toThrow();
      expect(errors[0])
        .toContain("a.ts: <A>: Missing a name at the end");
    });

    test("a template named by a constant of another file is checked", async () => {
      const { host, errors } = recordingHost({ "./constants.ts": fixture("constants.ts") });
      await expect(compileComponents(`
      import { brokenPage } from "./constants.ts";
      @Component({ template: brokenPage }) class A {}
    `, "/app/a.ts", host))
        .rejects
        .toThrow();
      expect(errors[0])
        .toContain("a.ts: <A>: Missing a name at the end");
    });

    test("a template named by a constant of another file that compiles is accepted", async () => {
      const { host, errors, warnings } = recordingHost({ "./constants.ts": fixture("constants.ts") });
      await compileComponents(`
      import { page } from "./constants.ts";
      @Component({ template: page }) class A {}
    `, "/app/a.ts", host);
      expect(errors)
        .toEqual([]);
      expect(warnings)
        .toEqual([]);
    });

    test("a selector named by a constant of the directive's own file is read", async () => {
      const { host, warnings } = recordingHost({ "./constants.ts": fixture("constants.ts") });
      await compileComponents(`
      import { Marked } from "./constants.ts";
      @Component({ template: "<p marked></p>", imports: [Marked] }) class A {}
    `, "/app/a.ts", host);
      expect(warnings)
        .toEqual([]);
    });

    test("a constant that the other file does not declare is warned about, and not checked", async () => {
      const { host, warnings } = recordingHost({ "./constants.ts": fixture("constants.ts") });
      await compileComponents(`
      import { nothere } from "./constants.ts";
      @Component({ template: nothere }) class A {}
    `, "/app/a.ts", host);
      expect(warnings)
        .toEqual(["a.ts: <A> is not compiled: its template is not a literal"]);
    });

    test("a constant imported from a file that cannot be found is not read", async () => {
      const { host, warnings } = recordingHost();
      await compileComponents(`
      import { page } from "./missing.ts";
      @Component({ template: page }) class A {}
    `, "/app/a.ts", host);
      expect(warnings)
        .toEqual(["a.ts: <A> is not compiled: its template is not a literal"]);
    });
  });

  describe("chained constants", () => {
    test("a template built from constants of the file is checked", async () => {
      const { host, errors } = recordingHost();
      await expect(compileComponents(`
      const open = "<p>";
      const body = open + "{{ a + }}</p>";
      @Component({ template: body }) class A {}
    `, "/app/a.ts", host))
        .rejects
        .toThrow();
      expect(errors[0])
        .toContain("a.ts: <A>: Missing a name at the end");
    });
  });
});
