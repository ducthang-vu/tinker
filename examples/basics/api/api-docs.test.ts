import { describe, expect, test } from "vitest";
import { TestBed } from "@tinker/testing";
import { nth } from "../testing-helpers.ts";
import { ApiDocs } from "./api-docs.ts";

describe("the API page, rendered from the generated reference", () => {
  test("has a section for each entry point, and a link to it", () => {
    const ref = TestBed.component(ApiDocs)
      .build();
    const headings = ref.root.queryAll("h2")
      .map((heading) => heading.text());
    expect(headings)
      .toContain("@tinker/core");
    expect(headings)
      .toContain("@tinker/functional");
    expect(ref.root.query("nav")
      .text())
      .toContain("@tinker/router");
    ref.destroy();
  });

  test("shows an export's signature and its description", () => {
    const ref = TestBed.component(ApiDocs)
      .build();
    const bootstrapArticle = ref.root.query("#tinker-core-bootstrap");
    expect(bootstrapArticle.text())
      .toContain("bootstrap");
    expect(nth(bootstrapArticle.queryAll("pre"), 0)
      .text())
      .toContain("bootstrap<T extends object>(type: Class<T>");
    ref.destroy();
  });

  test("marks a final class and lists its members", () => {
    const ref = TestBed.component(ApiDocs)
      .build();
    const injector = ref.root.query("#tinker-core-compiler-injector, #tinker-core-injector");
    expect(injector.text())
      .toContain("final");
    ref.destroy();
  });

  test("shows the deprecation of a member", () => {
    const ref = TestBed.component(ApiDocs)
      .build();
    expect(ref.root.query("#tinker-core-engine")
      .text())
      .toContain("Deprecated:");
    ref.destroy();
  });
});
