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
          isList: false,
          items: [],
          text: "",
          parts: [
            { text: "Adds ", code: false, href: "" },
            { text: "amount", code: true, href: "" },
            { text: ". Second line.", code: false, href: "" },
          ],
        },
        { isCode: false, isList: false, items: [], text: "", parts: [{ text: "A new paragraph.", code: false, href: "" }] },
      ]);
  });

  test("keeps a fenced code block as written", () => {
    const blocks = docBlocks("Example:\n```ts\nconst a = 1;\n\nconst b = 2;\n```");
    expect(blocks)
      .toHaveLength(2);
    expect(blocks[1])
      .toEqual({ isCode: true, isList: false, items: [], text: "const a = 1;\n\nconst b = 2;", parts: [] });
  });

  test("an unclosed fence is still a code block", () => {
    expect(docBlocks("```\nopen"))
      .toEqual([{ isCode: true, isList: false, items: [], text: "open", parts: [] }]);
  });

  test("empty text has no blocks", () => {
    expect(docBlocks(""))
      .toEqual([]);
  });
});

describe("anchorId", () => {
  test("makes an id with one dash per run of other characters, and keeps the case", () => {
    expect(anchorId("@tinker/core/compiler", "compileSource"))
      .toBe("tinker-core-compiler-compileSource");
    expect(anchorId("@tinker/functional", "MAP"))
      .not.toBe(anchorId("@tinker/functional", "map"));
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
        "demo-lib-Counter",
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
        { isCode: false, isList: false, items: [], text: "", parts: [{ text: "A counter.", code: false, href: "" }] },
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

describe("links and lists in descriptions", () => {
  const links = new Map([["Adder", "#core-Adder"]]);

  test("{@link Name} is a link to the export it names, and an unknown name is plain text", () => {
    const [block] = docBlocks("See {@link Adder}, or {@link Missing}.", links);
    expect(block!.parts.map((part) => [part.text, part.href]))
      .toEqual([["See ", ""], ["Adder", "#core-Adder"], [", or ", ""], ["Missing", ""], [".", ""]]);
  });

  test("a Markdown link is a link to its target", () => {
    const [block] = docBlocks("Read [the guide](https://example.com/guide) first.");
    expect(block!.parts[1])
      .toEqual({ text: "the guide", code: false, href: "https://example.com/guide" });
  });

  test("a code span is kept as written, even with a link inside it", () => {
    const [block] = docBlocks("Use `{@link Adder}` here.", links);
    expect(block!.parts[1])
      .toEqual({ text: "{@link Adder}", code: true, href: "" });
  });

  test("lines starting with - or * form a list, with its items' parts", () => {
    const blocks = docBlocks("Options:\n- first {@link Adder}\n* second\n\nAfter.", links);
    expect(blocks.map((block) => block.isList))
      .toEqual([false, true, false]);
    expect(blocks[1]!.items.map((item) => item.map((part) => part.text)))
      .toEqual([["first ", "Adder"], ["second"]]);
  });

  test("toSections gives every link the anchor of its export", () => {
    const reference = {
      entries: [{
        specifier: "@tinker/core",
        exports: [
          { name: "Adder", kind: "function", source: "", description: "See {@link Subtractor}.", signatures: [], examples: [], params: [], see: [], throws: [] },
          { name: "Subtractor", kind: "function", source: "", description: "", signatures: [], examples: [], params: [], see: [], throws: [] },
        ],
      }],
    } as unknown as Parameters<typeof toSections>[0];
    const [section] = toSections(reference);
    expect(section!.items[0]!.description[0]!.parts[1]!.href)
      .toBe(`#${anchorId("@tinker/core", "Subtractor")}`);
  });
});
