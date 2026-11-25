import { describe, expect, test } from "vitest";
import { TestBed } from "@tinker/testing";
import { nth } from "../../../testing/testing-helpers.ts";
import { DocBody } from "./api-docs.ts";

describe("a documented item", () => {
  test("shows the deprecation and the final flag of an item", () => {
    // The reference has no public deprecated item now, so this renders one by hand.
    const doc = {
      name: "oldApi",
      kind: "function",
      source: "packages/demo/src/old.ts:1",
      static: false,
      final: true,
      deprecated: "Use newApi instead.",
      signatures: [],
      overloads: [],
      type: "",
      declaration: "",
      description: [],
      params: [],
      returns: "",
      examples: [],
      see: [],
      throws: [],
    };
    const ref = TestBed.component(DocBody)
      .inputs({ doc })
      .build();
    expect(ref.root.query(".deprecated")
      .text())
      .toContain("Deprecated: Use newApi instead.");
    expect(ref.root.query(".badge")
      .text())
      .toBe("final");
    ref.destroy();
  });
});

describe("text around code spans", () => {
  test("a code span is set in place: no space before the text after it", () => {
    const doc = {
      name: "demo",
      kind: "function",
      source: "x.ts:1",
      static: false,
      final: false,
      signatures: [],
      overloads: [],
      type: "",
      declaration: "",
      description: [{ isCode: false, text: "", parts: [
        { text: "Use ", code: false },
        { text: "inject(Injector)", code: true },
        { text: ", then ", code: false },
        { text: "create()", code: true },
        { text: ".", code: false },
      ] }],
      params: [],
      returns: "",
      examples: [],
      see: [],
      throws: [],
    };
    const ref = TestBed.component(DocBody)
      .inputs({ doc })
      .build();
    const paragraph = nth(ref.root.queryAll("p"), 0);
    expect(paragraph.text())
      .toBe("Use inject(Injector), then create().");
    ref.destroy();
  });
});
