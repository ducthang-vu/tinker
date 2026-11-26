import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { generated, generateInto, prefixOf } from "./generate.ts";

describe("generated", () => {
  test("a component has the prefixed selector, and its class", () => {
    const file = generated("component", "user-card", "shop");

    expect(file.path)
      .toBe("src/user-card/user-card.ts");
    expect(file.content)
      .toContain(`selector: "shop-user-card"`);
    expect(file.content)
      .toContain("export class UserCardComponent {}");
    expect(file.usage)
      .toContain("UserCardComponent");
  });

  test("a directive has the prefixed attribute selector", () => {
    const file = generated("directive", "highlight", "app");

    expect(file.content)
      .toContain(`selector: "[app-highlight]"`);
    expect(file.content)
      .toContain("export class HighlightDirective {}");
  });

  test("a service is provided in the root injector", () => {
    const file = generated("service", "cart", "app");

    expect(file.content)
      .toContain(`@Injectable({ providedIn: "root" })`);
    expect(file.content)
      .toContain("export class CartService {}");
    expect(file.usage)
      .toContain("inject(CartService)");
  });

  test("a template function has its name in camel case, and a call()", () => {
    const file = generated("function", "format-price", "app");

    expect(file.content)
      .toContain(`@TemplateFunction("formatPrice")`);
    expect(file.content)
      .toContain("export class FormatPriceFunction");
    expect(file.content)
      .toContain("call(value: unknown): string");
  });
});

describe("generateInto", () => {
  let app: string;

  beforeEach(() => {
    app = mkdtempSync(join(tmpdir(), "tinker-generate-"));
    writeFileSync(join(app, "package.json"), JSON.stringify({ name: "shop", tinker: { prefix: "shop" } }));
  });

  afterEach(() => {
    rmSync(app, { recursive: true, force: true });
  });

  test("writes the file into src/<name>/, with the app's prefix", () => {
    const file = generateInto(app, "component", "cart");

    expect(readFileSync(join(app, file.path), "utf8"))
      .toContain(`selector: "shop-cart"`);
  });

  test("refuses an item that already exists, and writes nothing new", () => {
    mkdirSync(join(app, "src", "cart"), { recursive: true });

    expect(() => generateInto(app, "component", "cart"))
      .toThrow("already exists");
  });

  test("refuses an unknown kind, and an invalid name", () => {
    expect(() => generateInto(app, "pipe", "cart"))
      .toThrow(`"pipe" is not a kind to generate`);
    expect(() => generateInto(app, "service", "My_Cart"))
      .toThrow("is not a valid name");
  });

  test("refuses a folder that is not a Tinker app", () => {
    const plain = mkdtempSync(join(tmpdir(), "tinker-generate-plain-"));
    try {
      expect(() => generateInto(plain, "service", "cart"))
        .toThrow("This is not a Tinker app");
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test("prefixOf reads the prefix of the app, and fails without one", () => {
    expect(prefixOf(app))
      .toBe("shop");
    writeFileSync(join(app, "package.json"), JSON.stringify({ name: "shop" }));
    expect(() => prefixOf(app))
      .toThrow("has no tinker.prefix");
  });
});
