import { describe, expect, test } from "vitest";
import { Either } from "@tinker/functional";
import type { CompiledNode } from "../internal/template/compile.ts";
import { TemplateSyntaxError } from "../internal/template/tinker-parser.ts";
import { TemplateCompileError } from "../internal/template/compile-error.ts";
import { compileSource } from "./compile-source.ts";

const item = { selector: "tk-item", isComponent: true };

/** The error of a left result, or fails the test when the result is right. */
function errorOf(result: Either<readonly CompiledNode[], Error>): Error {
  return result.match({
    left: (error) => error,
    right: () => {
      throw new Error("expected an error, got compiled nodes");
    },
  });
}

describe("compileSource", () => {
  test("is right, with the compiled nodes, for a template that compiles", () => {
    const result = compileSource(`<p>Hi {{ name() }}</p><tk-item label="x"></tk-item>`, [item]);
    expect(result.isRight())
      .toBe(true);
    expect(result.match({
      left: (error) => {
        throw error;
      },
      right: (value) => value,
    }))
      .toHaveLength(2);
  });

  test("is right for a template with no imports", () => {
    expect(compileSource("<p>plain</p>")
      .isRight())
      .toBe(true);
  });

  test("is left with the syntax error for markup that does not parse", () => {
    const error = errorOf(compileSource("<div>\n<p></p>"));
    expect(error)
      .toBeInstanceOf(TemplateSyntaxError);
    expect(error.message)
      .toBe("1:1: <div> is never closed");
  });

  test("is left with the compiler's error for an invalid interpolation", () => {
    const error = errorOf(compileSource("<p>{{ a + }}</p>"));
    expect(error)
      .not.toBeInstanceOf(TemplateSyntaxError);
    expect(error)
      .toBeInstanceOf(Error);
  });

  test("is left when an element matches two components", () => {
    const error = errorOf(compileSource("<tk-a></tk-a>", [
      { selector: "tk-a", isComponent: true },
      { selector: "tk-a", isComponent: true },
    ]));
    expect(error.message)
      .toContain("matches several components");
  });

  test("is left when an import has an invalid selector", () => {
    const error = errorOf(compileSource("<p></p>", [{ selector: "", isComponent: false }]));
    expect(error)
      .toBeInstanceOf(Error);
  });
});

describe("compile errors and their place", () => {
  test("a compile error carries the span of the text it is in, nested in an element", () => {
    const error = errorOf(compileSource("<div>\n<p>{{ a + }}</p></div>"));
    expect(error)
      .toBeInstanceOf(TemplateCompileError);
    expect((error as TemplateCompileError).span)
      .toEqual({ start: 9, end: 18 });
  });

  describe("every syntax error of a template", () => {
    test("is reported together, from compileSource", () => {
      const error = errorOf(compileSource("<p a=></p><div>x</span></div>"));
      expect(error)
        .toBeInstanceOf(TemplateSyntaxError);
      expect(error.message)
        .toBe("1:6: expected an attribute value (at 1:6); </span> does not close <div> (at 1:17)");
    });
  });
});
