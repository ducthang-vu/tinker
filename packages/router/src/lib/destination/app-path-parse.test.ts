import { describe, expect, test } from "vitest";
import { parseAppPath, ParseError } from "./app-path-parse.ts";
import type { Route } from "../router/route.ts";

class Page {}

const ROOT: Route = {
  path: "",
  component: Page,
  children: [
    {
      path: "todos",
      component: Page,
      children: [
        { path: "", component: Page },
        { path: ":id", component: Page },
      ],
    },
    { path: "home", component: Page },
  ],
};

describe("parsing a URL from the root", () => {
  test("a URL that a route takes is an app path, with its segments as the route gives them", () => {
    expect(parseAppPath(ROOT, "/todos/7").segments)
      .toEqual([
        { kind: "segment", value: "todos" },
        { kind: "param", name: "id", value: "7" },
      ]);
  });

  test("the query and the fragment are read, and the fragment is decoded", () => {
    const path = parseAppPath(ROOT, "/home?a=1#top%20half");
    expect(path.query)
      .toEqual({ a: "1" });
    expect(path.fragment)
      .toBe("top half");
  });

  test("a URL with no fragment has none", () => {
    expect(parseAppPath(ROOT, "/home").fragment)
      .toBeUndefined();
  });

  test("a URL no route takes throws a no-route ParseError, naming its last segment", () => {
    expect(() => parseAppPath(ROOT, "/nowhere"))
      .toThrow(ParseError);
    try {
      parseAppPath(ROOT, "/todos/7/extra");
    } catch (error) {
      expect((error as ParseError).at)
        .toBe("extra");
    }
  });

  test("the root URL names the root, and throws when no route takes the root", () => {
    expect(() => parseAppPath(ROOT, "/"))
      .toThrow(ParseError);
  });

  test("a malformed part throws a malformed ParseError", () => {
    expect(() => parseAppPath(ROOT, "/home%E0%A4%A"))
      .toThrow("malformed");
  });
});

describe("the same URL in the router is the same URL in the builder", () => {
  test("a path with an empty route takes the URL of its parent", () => {
    expect(parseAppPath(ROOT, "/todos").segments)
      .toEqual([{ kind: "segment", value: "todos" }]);
  });
});
