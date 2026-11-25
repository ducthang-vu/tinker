import { describe, expect, test } from "vitest";
import { isAppPath, makeAppPath, type Segment } from "./app-path.ts";

const todo: Segment[] = [
  { kind: "segment", value: "todos" },
  { kind: "param", name: "id", value: "7" },
];

describe("formatting an app path", () => {
  test("segments are joined under a leading slash", () => {
    expect(makeAppPath(todo, {}, undefined)
      .format())
      .toBe("/todos/7");
  });

  test("no segments is the root", () => {
    expect(makeAppPath([], {}, undefined)
      .format())
      .toBe("/");
  });

  test("the query is always serialized, in the order its keys were given", () => {
    expect(makeAppPath(todo, { tab: "done", sort: "due" }, undefined)
      .format())
      .toBe("/todos/7?tab=done&sort=due");
  });

  test("a query value and name are percent-encoded", () => {
    expect(makeAppPath([], { "a b": "x&y" }, undefined)
      .format())
      .toBe("/?a%20b=x%26y");
  });

  test("the fragment comes last, percent-encoded", () => {
    expect(makeAppPath(todo, { tab: "done" }, "top half")
      .format())
      .toBe("/todos/7?tab=done#top%20half");
  });

  test("a segment value is percent-encoded", () => {
    expect(makeAppPath([{ kind: "param", name: "id", value: "a b/c" }], {}, undefined)
      .format())
      .toBe("/a%20b%2Fc");
  });
});

describe("an app path is fixed once made", () => {
  test("the query given to it is copied, so a later change to the object does not show", () => {
    const query: Record<string, string> = { tab: "done" };
    const path = makeAppPath(todo, query, undefined);
    query.tab = "open";
    expect(path.query)
      .toEqual({ tab: "done" });
  });

  test("the query cannot be changed through the value", () => {
    const path = makeAppPath(todo, { tab: "done" }, undefined);
    expect(Object.isFrozen(path.query))
      .toBe(true);
  });

  test("its segments and fragment are the ones it was made with", () => {
    const path = makeAppPath(todo, {}, "top");
    expect(path.segments)
      .toEqual(todo);
    expect(path.fragment)
      .toBe("top");
  });
});

describe("telling an app path from another value", () => {
  test("a value made by the builder is an app path", () => {
    expect(isAppPath(makeAppPath([], {}, undefined)))
      .toBe(true);
  });

  test("an object with the same shape but without the brand is not", () => {
    expect(isAppPath({ segments: [], query: {}, fragment: undefined, format: () => "/" }))
      .toBe(false);
  });

  test("null and primitives are not app paths", () => {
    expect(isAppPath(null))
      .toBe(false);
    expect(isAppPath("/todos"))
      .toBe(false);
  });
});
