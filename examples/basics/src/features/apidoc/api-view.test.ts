import { describe, expect, test } from "vitest";
import type { ApiReference } from "./api-reference.ts";
import { nth } from "../../../testing/testing-helpers.ts";
import { anchorId, docBlocks, toSections } from "./api-view.ts";

describe("docBlocks", () => {
  test("splits paragraphs at blank lines and marks code spans", () => {
    const blocks = docBlocks("Adds `amount`.\nSecond line.\n\nA new paragraph.");
    expect(blocks)
      .toEqual([
        {
          isCode: false,
          text: "",
          parts: [
            { text: "Adds ", code: false },
            { text: "amount", code: true },
            { text: ". Second line.", code: false },
          ],
        },
        { isCode: false, text: "", parts: [{ text: "A new paragraph.", code: false }] },
      ]);
  });

  test("keeps a fenced code block as written", () => {
    const blocks = docBlocks("Example:\n```ts\nconst a = 1;\n\nconst b = 2;\n```");
    expect(blocks)
      .toHaveLength(2);
    expect(blocks[1])
      .toEqual({ isCode: true, text: "const a = 1;\n\nconst b = 2;", parts: [] });
  });

  test("an unclosed fence is still a code block", () => {
    expect(docBlocks("```\nopen"))
      .toEqual([{ isCode: true, text: "open", parts: [] }]);
  });

  test("empty text has no blocks", () => {
    expect(docBlocks(""))
      .toEqual([]);
  });
});

describe("anchorId", () => {
  test("makes a lower-case id with one dash per run of other characters", () => {
    expect(anchorId("@tinker/core/compiler", "compileSource"))
      .toBe("tinker-core-compiler-compilesource");
    expect(anchorId("--a  b--"))
      .toBe("a-b");
  });
});

describe("toSections", () => {
  const reference: ApiReference = {
    entries: [
      {
        specifier: "@demo/lib",
        source: "packages/demo/src/index.ts",
        exports: [
          {
            name: "Counter",
            kind: "class",
            source: "packages/demo/src/counter.ts:3",
            description: "A counter.",
            params: [],
            examples: ["```ts\nnew Counter()\n```"],
            see: [],
            throws: [],
            final: true,
            signatures: ["new Counter(): Counter"],
            members: [
              {
                name: "add",
                kind: "method",
                source: "packages/demo/src/counter.ts:9",
                description: "",
                params: [{ name: "amount", text: "how much" }],
                examples: [],
                see: [],
                throws: [],
                returns: "the total",
                signatures: ["add(amount: number): number"],
              },
            ],
          },
          {
            name: "legacy",
            kind: "function",
            source: "packages/demo/src/legacy.ts:1",
            description: "",
            params: [],
            examples: [],
            see: [],
            throws: [],
            deprecated: "",
          },
        ],
      },
      { specifier: "@demo/empty", source: "packages/empty/src/index.ts", exports: [] },
    ],
  };

  test("gives each entry point a section, with an id and its items", () => {
    const lib = nth(toSections(reference), 0);
    const empty = nth(toSections(reference), 1);
    expect(lib.id)
      .toBe("demo-lib");
    expect(lib.hasItems)
      .toBe(true);
    expect(lib.items.map((item) => item.id))
      .toEqual([
        "demo-lib-counter",
        "demo-lib-legacy",
      ]);
    expect(empty.hasItems)
      .toBe(false);
  });

  test("shows the flags and the description of an item and its members", () => {
    const counter = nth(nth(toSections(reference), 0).items, 0);
    expect(counter.final)
      .toBe(true);
    expect(counter.deprecated)
      .toBe("");
    expect(counter.description)
      .toEqual([
        { isCode: false, text: "", parts: [{ text: "A counter.", code: false }] },
      ]);
    expect(nth(counter.examples, 0).isCode)
      .toBe(true);
    expect(counter.hasMembers)
      .toBe(true);

    const add = nth(counter.members, 0);
    expect(add.signatures)
      .toEqual(["add(amount: number): number"]);
    expect(add.params)
      .toEqual([{ name: "amount", text: "how much" }]);
    expect(add.returns)
      .toBe("the total");
    expect(add.description)
      .toEqual([]);
  });

  test("a deprecation with no text still says so, and empty optional fields are empty", () => {
    const legacy = nth(nth(toSections(reference), 0).items, 1);
    expect(legacy.deprecated)
      .toBe("Deprecated.");
    expect(legacy.final)
      .toBe(false);
    expect(legacy.static)
      .toBe(false);
    expect(legacy.hasMembers)
      .toBe(false);
    expect(legacy.type)
      .toBe("");
    expect(legacy.declaration)
      .toBe("");
    expect(legacy.returns)
      .toBe("");
  });
});
