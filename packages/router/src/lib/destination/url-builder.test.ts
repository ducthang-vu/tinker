import { describe, expect, test } from "vitest";
import { Injector, inject, runInInjectionContext } from "@tinker/core";
import { provideRouter } from "../router/provide-router.ts";
import { Router } from "../router/router.ts";
import type { Route } from "../router/route.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import { ParseError, Path, UrlBuilder } from "./url-builder.ts";

class Page {}

/** The todos (a list at `/todos`, a detail at `/todos/:id`) and a home page. */
const TREE: Route[] = [
  {
    path: "todos",
    component: Page,
    children: [
      { path: "", component: Page },
      { path: ":id", component: Page },
    ],
  },
  { path: "home", component: Page },
];

/** A router over `routes`, and the injected builder of it, at the URL the page is at. */
function builderOver(routes: readonly Route[], url = "/") {
  window.history.replaceState(null, "", url);
  const { injector, destroy } = Injector.create({ providers: provideRouter(routes) });
  return {
    urls: runInInjectionContext(injector, () => inject(UrlBuilder)),
    router: runInInjectionContext(injector, () => inject(Router)),
    destroy,
  };
}

/** The parse error of `url`, from the builder over the todos tree. */
function parseErrorOf(url: string): ParseError {
  const { urls, destroy } = builderOver(TREE);
  try {
    urls.parse(url);
  } catch (error) {
    if (error instanceof ParseError) {
      return error;
    }
    throw error;
  } finally {
    destroy();
  }
  throw new Error(`expected ${url} not to parse`);
}

describe("building a path from the root", () => {
  test("segments and params compose in order", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.root()
      .withSegment("todos")
      .withParam("id", "7")
      .build()
      .format())
      .toBe("/todos/7");
    destroy();
  });

  test("a param value is percent-encoded", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.root()
      .withSegment("todos")
      .withParam("id", "a b/c")
      .build()
      .format())
      .toBe("/todos/a%20b%2Fc");
    destroy();
  });

  test("the root alone is the root path", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.root()
      .build()
      .format())
      .toBe("/");
    destroy();
  });

  test("a segment no child takes throws, naming the segment and its parent", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(() => urls.root()
      .withSegment("nope"))
      .toThrow("no segment \"nope\" under \"\"");
    destroy();
  });

  test("a param no child declares throws", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(() => urls.root()
      .withSegment("todos")
      .withParam("slug", "1"))
      .toThrow("no param \"slug\" under \"todos\"");
    destroy();
  });

  test("a child of a route with no children throws", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(() => urls.root()
      .withSegment("home")
      .withSegment("x"))
      .toThrow("no segment \"x\" under \"home\"");
    destroy();
  });

  test("a Path can be kept and extended twice", () => {
    const { urls, destroy } = builderOver(TREE);
    const todos = urls.root()
      .withSegment("todos");
    expect(todos.withParam("id", "1")
      .build()
      .format())
      .toBe("/todos/1");
    expect(todos.withSegment("")
      .build()
      .format())
      .toBe("/todos");
    destroy();
  });

  test("up goes back to the parent, and throws at the root", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.root()
      .withSegment("todos")
      .withParam("id", "7")
      .up()
      .build()
      .format())
      .toBe("/todos");
    expect(() => urls.root()
      .up())
      .toThrow("up: already at the root");
    destroy();
  });

  test("Path.rootOf builds from a tree that is not the router's", () => {
    expect(Path.rootOf([{ path: "shop", component: Page }])
      .withSegment("shop")
      .build()
      .format())
      .toBe("/shop");
  });
});

describe("query and fragment", () => {
  test("query pairs come after the path, in order, and the fragment last", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.root()
      .withSegment("home")
      .withQuery("a", "1")
      .withQuery("b", "2")
      .withFragment("top")
      .build()
      .format())
      .toBe("/home?a=1&b=2#top");
    destroy();
  });

  test("a query value is percent-encoded", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.root()
      .withSegment("home")
      .withQuery("q", "a b&c")
      .build()
      .format())
      .toBe("/home?q=a%20b%26c");
    destroy();
  });

  test("after a fragment, a query or another fragment throws", () => {
    const { urls, destroy } = builderOver(TREE);
    const hashed = urls.root()
      .withSegment("home")
      .withFragment("top");
    expect(() => hashed.withQuery("a", "1"))
      .toThrow("the fragment comes last");
    expect(() => hashed.withFragment("again"))
      .toThrow("the fragment is already set");
    destroy();
  });

  test("after a query, a path step, up, or parse throws", () => {
    const { urls, destroy } = builderOver(TREE);
    const queried = urls.root()
      .withSegment("home")
      .withQuery("a", "1");
    expect(() => queried.withSegment("todos"))
      .toThrow("the path comes before the query and the fragment");
    expect(() => queried.withParam("id", "1"))
      .toThrow("the path comes before the query and the fragment");
    expect(() => queried.up())
      .toThrow("the path comes before the query and the fragment");
    expect(() => queried.parse("/todos"))
      .toThrow("the path comes before the query and the fragment");
    destroy();
  });
});

describe("relative to a route", () => {
  test("relativeTo a route writes the parts it was reached by", () => {
    const { urls, router, destroy } = builderOver(TREE, "/todos/7");
    const detail = router.activated()[2] as ActivatedRoute;
    expect(urls.relativeTo(detail)
      .withQuery("tab", "done")
      .build()
      .format())
      .toBe("/todos/7?tab=done");
    destroy();
  });

  test("a relative parse continues from the position, and a leading slash starts at the root", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.root()
      .withSegment("todos")
      .parse("7")
      .build()
      .format())
      .toBe("/todos/7");
    expect(urls.root()
      .withSegment("todos")
      .parse("/home")
      .build()
      .format())
      .toBe("/home");
    destroy();
  });
});

describe("parse", () => {
  test("a URL of the tree parses to a destination, with its params as params", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.parse("/todos/7").parts)
      .toEqual([
        { kind: "segment", value: "todos" },
        { kind: "param", name: "id", value: "7" },
      ]);
    destroy();
  });

  test("the query and the fragment are parsed and decoded", () => {
    const { urls, destroy } = builderOver(TREE);
    const destination = urls.parse("/todos/a%20b?q=x%26y&flag#h%20i");
    expect(destination.query)
      .toEqual([["q", "x&y"], ["flag", ""]]);
    expect(destination.fragment)
      .toBe("h i");
    destroy();
  });

  test("empty query pairs are skipped", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.parse("/home?a=1&&b=2").query)
      .toEqual([["a", "1"], ["b", "2"]]);
    destroy();
  });

  test("a destination the builder makes parses back to the same URL", () => {
    const { urls, destroy } = builderOver(TREE);
    const url = urls.root()
      .withSegment("todos")
      .withParam("id", "a b")
      .withQuery("tab", "done")
      .withFragment("top")
      .build()
      .format();
    expect(urls.parse(url)
      .format())
      .toBe(url);
    destroy();
  });

  test("a segment no route matches throws a no-route ParseError", () => {
    const error = parseErrorOf("/nowhere");
    expect(error.reason)
      .toBe("no-route");
    expect(error.at)
      .toBe("nowhere");
  });

  test("a path that goes below a route with no children throws no-route", () => {
    const error = parseErrorOf("/home/extra");
    expect(error.reason)
      .toBe("no-route");
    expect(error.at)
      .toBe("extra");
  });

  test("the URL stops short of a route that needs a segment: the last segment is reported", () => {
    const { urls, destroy } = builderOver([
      { path: "group", component: Page, children: [{ path: ":id", component: Page }] },
    ]);
    expect(() => urls.parse("/group"))
      .toThrow(ParseError);
    destroy();
  });

  test("a root URL with no route for the root throws, at an empty segment", () => {
    const error = parseErrorOf("/");
    expect(error.reason)
      .toBe("no-route");
    expect(error.at)
      .toBe("");
  });

  test("a malformed percent-encoding throws a malformed ParseError in the path, query or fragment", () => {
    expect(parseErrorOf("/home/%E0%A4%A").reason)
      .toBe("malformed");
    expect(parseErrorOf("/home?a=%E0%A4%A").reason)
      .toBe("malformed");
    expect(parseErrorOf("/home#%E0%A4%A").reason)
      .toBe("malformed");
  });

  test("a ** route takes the rest of the URL, and its segments are literal parts", () => {
    const { urls, destroy } = builderOver([
      { path: "home", component: Page },
      { path: "**", component: Page },
    ]);
    expect(urls.parse("/nowhere/a")
      .format())
      .toBe("/nowhere/a");
    destroy();
  });

  test("a relative start from a route with no children, to a segment it has none for, throws", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(() => urls.root()
      .withSegment("home")
      .parse("x"))
      .toThrow(ParseError);
    destroy();
  });

  test("UrlBuilder.parse parses from the root", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.parse("/home?x=1#y")
      .format())
      .toBe("/home?x=1#y");
    destroy();
  });
});
