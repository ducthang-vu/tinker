import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { apply, generated, plan, prefixOf, register, settingsOf } from "./generate.ts";
import { createApp } from "./new.ts";

describe("generated", () => {
  test("a component has the prefixed selector, and its class", () => {
    const item = generated("component", "user-card", "shop");

    expect(item.files[0]!.path)
      .toBe("src/user-card/user-card.ts");
    expect(item.files[0]!.content)
      .toContain(`selector: "shop-user-card"`);
    expect(item.files[0]!.content)
      .toContain("export class UserCardComponent {}");
    expect(item.className)
      .toBe("UserCardComponent");
  });

  test("a directive has the prefixed attribute selector", () => {
    const item = generated("directive", "highlight", "app");

    expect(item.files[0]!.content)
      .toContain(`selector: "[app-highlight]"`);
    expect(item.className)
      .toBe("HighlightDirective");
  });

  test("a service is provided in the root injector, and needs no registration", () => {
    const item = generated("service", "cart", "app");

    expect(item.files[0]!.content)
      .toContain(`@Injectable({ providedIn: "root" })`);
    expect(item.className)
      .toBeUndefined();
  });

  test("a template function has its name in camel case, and a call()", () => {
    const item = generated("function", "format-price", "app");

    expect(item.files[0]!.content)
      .toContain(`@TemplateFunction("formatPrice")`);
    expect(item.files[0]!.content)
      .toContain("call(value: unknown): string");
    expect(item.className)
      .toBe("FormatPriceFunction");
  });
});

describe("register", () => {
  const app = `import { Component } from "@tinker/core";
import { Header } from "./header/header.ts";

@Component({
  selector: "shop-root",
  template: \`<shop-header></shop-header>\`,
  imports: [Header],
})
export class App {}
`;

  test("adds the import after the last import, and the class to the imports list", () => {
    const next = register(app, "CartComponent", "./cart/cart.ts");

    expect(next)
      .toContain(`import { CartComponent } from "./cart/cart.ts";`);
    expect(next)
      .toContain("imports: [Header, CartComponent],");
    expect(next.indexOf("./cart/cart.ts"))
      .toBeGreaterThan(next.indexOf("./header/header.ts"));
  });

  test("adds an imports list when the root component has none", () => {
    const bare = `import { Component } from "@tinker/core";

@Component({
  selector: "shop-root",
  template: \`<p>x</p>\`,
})
export class App {}
`;
    const next = register(bare, "CartComponent", "./cart/cart.ts");

    expect(next)
      .toContain("  imports: [CartComponent],\n})");
  });

  test("fills an empty imports list", () => {
    const empty = `import { Component } from "@tinker/core";

@Component({
  selector: "shop-root",
  imports: [],
})
export class App {}
`;
    expect(register(empty, "CartComponent", "./cart/cart.ts"))
      .toContain("imports: [CartComponent],");
  });

  test("refuses a decorator that does not close on its own line", () => {
    expect(() => register(`@Component({ selector: "x" });\nexport class App {}\n`, "X", "./x.ts"))
      .toThrow("does not close on its own line");
  });

  test("refuses an app with no root component, or an imports list over several lines", () => {
    expect(() => register("export class App {}\n", "X", "./x.ts"))
      .toThrow("has no @Component");
    const multi = app.replace("imports: [Header],", "imports: [\n    Header,\n  ],");
    expect(() => register(multi, "X", "./x.ts"))
      .toThrow("spans lines");
  });
});

describe("plan and apply", () => {
  let parent: string;
  let appFolder: string;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), "tinker-generate-"));
    appFolder = createApp("shop", parent, "shop");
  });

  afterEach(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  test("a component is planned with its file and the root component's new content", () => {
    const planned = plan(appFolder, "component", "cart");

    expect(planned.files.map((file) => file.path))
      .toEqual(["src/cart/cart.ts", "src/cart/cart.test.ts"]);
    expect(planned.app?.content)
      .toContain(`import { CartComponent } from "./cart/cart.ts";`);
    expect(planned.app?.content)
      .toContain("imports: [CartComponent],");
    expect(existsSync(join(appFolder, "src", "cart")))
      .toBe(false);
  });

  test("a service is planned with its file, and leaves the root component alone", () => {
    const planned = plan(appFolder, "service", "cart");

    expect(planned.files.map((file) => file.path))
      .toEqual(["src/cart/cart.ts"]);
    expect(planned.app)
      .toBeUndefined();
  });

  test("a component is a folder with its source file and its test file", () => {
    apply(appFolder, plan(appFolder, "component", "cart"));

    expect(existsSync(join(appFolder, "src", "cart", "cart.ts")))
      .toBe(true);
    expect(readFileSync(join(appFolder, "src", "cart", "cart.test.ts"), "utf8"))
      .toContain("CartComponent");
  });

  test("apply writes the file and the root component", () => {
    apply(appFolder, plan(appFolder, "directive", "highlight"));

    expect(readFileSync(join(appFolder, "src", "highlight", "highlight.ts"), "utf8"))
      .toContain("HighlightDirective");
    expect(readFileSync(join(appFolder, "src", "app.ts"), "utf8"))
      .toContain("imports: [HighlightDirective],");
  });

  test("refuses an item that exists, an unknown kind, and an invalid name, and writes nothing", () => {
    apply(appFolder, plan(appFolder, "component", "cart"));
    const before = readFileSync(join(appFolder, "src", "app.ts"), "utf8");

    expect(() => plan(appFolder, "component", "cart"))
      .toThrow("already exists");
    expect(() => plan(appFolder, "pipe", "cart"))
      .toThrow(`"pipe" is not a kind to generate`);
    expect(() => plan(appFolder, "service", "My_Cart"))
      .toThrow("is not a valid name");
    expect(readFileSync(join(appFolder, "src", "app.ts"), "utf8"))
      .toBe(before);
  });

  test("refuses an app with no root component file, before it writes anything", () => {
    rmSync(join(appFolder, "src", "app.ts"));

    expect(() => plan(appFolder, "component", "cart"))
      .toThrow("There is no src/app.ts");
    expect(existsSync(join(appFolder, "src", "cart")))
      .toBe(false);
  });

  test("a component's test follows the runner of the app: vitest, or node", () => {
    const vitest = generated("component", "cart", "app", "vitest").files[1]!.content;
    const node = generated("component", "cart", "app", "node").files[1]!.content;

    expect(vitest)
      .toContain(`from "vitest"`);
    expect(node)
      .toContain(`from "node:test"`);
  });

  test("tinker.json holds the settings, and wins over the old key of package.json", () => {
    mkdirSync(join(parent, "both"));
    writeFileSync(join(parent, "both", "tinker.json"), JSON.stringify({ prefix: "new", testRunner: "node" }));
    writeFileSync(join(parent, "both", "package.json"), JSON.stringify({ tinker: { prefix: "old" } }));

    expect(settingsOf(join(parent, "both")))
      .toEqual({ prefix: "new", testRunner: "node" });
  });

  test("a folder with no settings in either file is not a Tinker app", () => {
    mkdirSync(join(parent, "none"));
    writeFileSync(join(parent, "none", "package.json"), JSON.stringify({ name: "none" }));

    expect(() => settingsOf(join(parent, "none")))
      .toThrow("it has no tinker.json with a prefix");
  });

  test("an app with no runner in package.json uses vitest", () => {
    mkdirSync(join(parent, "no-runner"));
    writeFileSync(join(parent, "no-runner", "package.json"), JSON.stringify({ tinker: { prefix: "shop" } }));

    expect(settingsOf(join(parent, "no-runner")))
      .toEqual({ prefix: "shop", testRunner: "vitest" });
  });

  test("the runner of the app is read from package.json, and an unknown one is refused", () => {
    mkdirSync(join(parent, "runner"));
    writeFileSync(join(parent, "runner", "package.json"), JSON.stringify({ tinker: { prefix: "shop", testRunner: "node" } }));
    expect(settingsOf(join(parent, "runner")))
      .toEqual({ prefix: "shop", testRunner: "node" });
    writeFileSync(join(parent, "runner", "package.json"), JSON.stringify({ tinker: { prefix: "shop", testRunner: "jest" } }));
    expect(() => settingsOf(join(parent, "runner")))
      .toThrow(`"testRunner" is "jest", but it must be vitest or node`);
  });

  test("a prefix that is not valid is refused, and the error names the file", () => {
    mkdirSync(join(parent, "badprefix"));
    writeFileSync(join(parent, "badprefix", "tinker.json"), JSON.stringify({ prefix: "My-Shop" }));

    expect(() => settingsOf(join(parent, "badprefix")))
      .toThrow(`tinker.json: "prefix" is "My-Shop"`);
  });

  test("a folder with no package.json is not a Tinker app", () => {
    const bare = join(parent, "bare");
    mkdirSync(bare);

    expect(() => prefixOf(bare))
      .toThrow("This is not a Tinker app");
  });

  test("refuses a folder that is not a Tinker app", () => {
    const plain = join(parent, "plain");
    mkdirSync(plain);
    writeFileSync(join(plain, "package.json"), JSON.stringify({ name: "plain" }));

    expect(() => plan(plain, "service", "cart"))
      .toThrow("This is not a Tinker app");
    expect(prefixOf(appFolder))
      .toBe("shop");
  });
});
