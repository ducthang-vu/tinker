import { describe, expect, test } from "vitest";
import { apiReference } from "./api-reference.ts";
import type { ApiEntry, ApiExport } from "./api-reference.ts";
import { entryOf, groupByKind, packageLinks, slugOf, summaryOf, viewItemOf } from "./api-pages.ts";

/** An export of the given kind and name, for the grouping tests. */
function exported(name: string, kind: string): ApiExport {
  return {
    name,
    kind,
    source: "x.ts:1",
    description: "",
    params: [],
    examples: [],
    see: [],
    throws: [],
  };
}

describe("slugOf", () => {
  test("a package's URL name drops the scope, and joins a sub-path with a dash", () => {
    expect(slugOf("@tinker/router"))
      .toBe("router");
    expect(slugOf("@tinker/core/compiler"))
      .toBe("core-compiler");
  });
});

describe("packageLinks and entryOf", () => {
  const entries: ApiEntry[] = [
    { specifier: "@tinker/core", source: "core", exports: [exported("a", "function")] },
    { specifier: "@tinker/router", source: "router", exports: [] },
  ];

  test("each package links to its page, with its number of exports", () => {
    expect(packageLinks(entries))
      .toEqual([
        { slug: "core", specifier: "@tinker/core", count: 1, href: "/api/core" },
        { slug: "router", specifier: "@tinker/router", count: 0, href: "/api/router" },
      ]);
  });

  test("a URL name finds its entry point, and an unknown one finds none", () => {
    expect(entryOf(entries, "router")?.specifier)
      .toBe("@tinker/router");
    expect(entryOf(entries, "nope"))
      .toBeUndefined();
  });
});

describe("groupByKind", () => {
  test("groups exports by kind in order, leaves out empty kinds, and puts other kinds last", () => {
    const groups = groupByKind([
      exported("weird", "namespace"),
      exported("run", "function"),
      exported("Box", "class"),
      exported("more", "function"),
    ]);
    expect(groups.map((group) => group.label))
      .toEqual(["Classes", "Functions", "Other"]);
    expect(groups[1]!.items.map((item) => item.name))
      .toEqual(["run", "more"]);
  });
});

describe("summaryOf", () => {
  test("the first sentence of a description", () => {
    expect(summaryOf("Adds two numbers. It keeps the sum."))
      .toBe("Adds two numbers.");
    expect(summaryOf("No full stop here"))
      .toBe("No full stop here");
  });
});

describe("viewItemOf", () => {
  test("finds the export of a package, with its documentation", () => {
    const item = viewItemOf(apiReference, { package: "core", symbol: "bootstrap" });
    expect(item?.name)
      .toBe("bootstrap");
    expect(item?.kind)
      .toBe("function");
  });

  test("finds nothing for an unknown package or export", () => {
    expect(viewItemOf(apiReference, { package: "nope", symbol: "bootstrap" }))
      .toBeUndefined();
    expect(viewItemOf(apiReference, { package: "core", symbol: "nope" }))
      .toBeUndefined();
  });
});
