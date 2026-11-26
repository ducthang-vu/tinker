import { describe, expect, test } from "vitest";
import { fingerprintOf, hotCodeFor } from "./hot-code.ts";

const page = (template: string, body = "count = 1;") => `
  import { Component } from "@tinker/core";
  @Component({ selector: "tk-page", template: "${template}" })
  export class Page {
    ${body}
  }
`;

describe("hotCodeFor", () => {
  test("a module that declares no component gets no hot code", () => {
    expect(hotCodeFor("export const value = 1;", "/app/value.ts"))
      .toBeUndefined();
  });

  test("a module with a component calls __tinkerHot with its components, when hot", () => {
    const code = hotCodeFor(page("<p>x</p>"), "/app/page.ts") ?? "";
    expect(code)
      .toContain(`import { __tinkerHot } from "@tinker/core/hot";`);
    expect(code)
      .toContain("if (import.meta.hot) {");
    expect(code)
      .toContain(`__tinkerHot(import.meta.hot, "/app/page.ts", "`);
    expect(code)
      .toContain(`[["Page", Page]]`);
  });

  test("a component without an inline template still gets the hot code", () => {
    const code = `@Component({ selector: "tk-x", templateUrl: "./x.html" }) export class X {}`;
    expect(hotCodeFor(code, "/app/x.ts"))
      .toContain("[[\"X\", X]]");
  });

  test("a change of only a template keeps the fingerprint", () => {
    const before = hotCodeFor(page("<p>one</p>"), "/app/page.ts");
    const after = hotCodeFor(page("<p>two</p>"), "/app/page.ts");
    expect(after)
      .toBe(before);
  });

  test("a change of the class code changes the fingerprint", () => {
    const before = hotCodeFor(page("<p>one</p>"), "/app/page.ts");
    const after = hotCodeFor(page("<p>one</p>", "count = 2;"), "/app/page.ts");
    expect(after)
      .not
      .toBe(before);
  });
});

describe("fingerprintOf", () => {
  test("leaves out the text between the template ranges, whatever their order", () => {
    const code = "aXXXbYYYc";
    const ranges = [{ start: 1, end: 4 }, { start: 5, end: 8 }];
    expect(fingerprintOf(code, ranges))
      .toBe(fingerprintOf("a___b___c", ranges));
    expect(fingerprintOf(code, [...ranges].reverse()))
      .toBe(fingerprintOf(code, ranges));
  });
});
