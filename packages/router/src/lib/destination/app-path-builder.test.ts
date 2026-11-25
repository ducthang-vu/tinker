import { describe, expect, test } from "vitest";
import { Injector, inject, provide, runInInjectionContext, signal } from "@tinker/core";
import { provideRouter } from "../router/provide-router.ts";
import { Router } from "../router/router.ts";
import type { Route } from "../router/route.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import { AppPathBuilder, APP_PATH_BUILDER, ParseError, providePathBuilder } from "./app-path-builder.ts";

class Page {}

/** The todos (a list under `""`, a detail under `:id`) and a home page. */
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

/** The parse error of a step, or throws when it does not fail. */
function errorOf(step: () => unknown): ParseError {
  try {
    step();
  } catch (error) {
    if (error instanceof ParseError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the step to fail");
}

/** A router over `routes`, at `url`, and the builder it provides at the root. */
function builderOver(routes: readonly Route[], url = "/") {
  window.history.replaceState(null, "", url);
  const { injector, destroy } = Injector.create({ providers: provideRouter(routes) });
  return {
    urls: runInInjectionContext(injector, () => inject(APP_PATH_BUILDER)),
    router: runInInjectionContext(injector, () => inject(Router)),
    destroy,
  };
}

describe("steps that add segments", () => {
  test("several arguments are segments, a param taking any value", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("todos", "7")
      .build()
      .format())
      .toBe("/todos/7");
  });

  test("one string is split on slashes", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("todos/7")
      .build()
      .format())
      .toBe("/todos/7");
  });

  test("an empty single string adds nothing", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("")
      .build()
      .format())
      .toBe("/");
  });

  test("a segment that no route takes throws a no-route ParseError, naming it", () => {
    const error = errorOf(() => AppPathBuilder.rootOf(TREE)
      .to("nope"));
    expect(error.reason)
      .toBe("no-route");
    expect(error.at)
      .toBe("nope");
  });

  test("a segment with a slash is encoded, so a param takes it as one value", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("todos", "a/b")
      .build()
      .format())
      .toBe("/todos/a%2Fb");
  });

  test("a segment below a route with no children throws", () => {
    expect(() => AppPathBuilder.rootOf(TREE)
      .to("home", "x"))
      .toThrow(ParseError);
  });

  test("a path can stop short of a leaf: the matcher decides that when the URL is used", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("todos")
      .build()
      .format())
      .toBe("/todos");
  });

  test("a builder can be kept and extended in more than one direction", () => {
    const todos = AppPathBuilder.rootOf(TREE)
      .to("todos");
    expect(todos.to("7")
      .build()
      .format())
      .toBe("/todos/7");
    expect(todos.to("")
      .build()
      .format())
      .toBe("/todos");
  });

  test("a segment after an empty route is taken from the parent", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("todos", "")
      .parse("7")
      .build()
      .format())
      .toBe("/todos/7");
  });

  test("a ** route takes the rest of the URL in one level", () => {
    const tree: Route[] = [{ path: "home", component: Page }, { path: "**", component: Page }];
    expect(AppPathBuilder.rootOf(tree)
      .to("nowhere", "a", "b")
      .build()
      .format())
      .toBe("/nowhere/a/b");
  });

  test("a ** route catches a param-less segment after it", () => {
    const tree: Route[] = [{ path: "**", component: Page }];
    expect(AppPathBuilder.rootOf(tree)
      .parse("/anything")
      .build()
      .format())
      .toBe("/anything");
  });
});

describe("parse", () => {
  test("an absolute URL is read from the root, with its query and fragment", () => {
    const destination = AppPathBuilder.rootOf(TREE)
      .parse("/todos/7?tab=done#top")
      .build();
    expect(destination.segments)
      .toEqual([
        { kind: "segment", value: "todos" },
        { kind: "param", name: "id", value: "7" },
      ]);
    expect(destination.query)
      .toEqual({ tab: "done" });
    expect(destination.fragment)
      .toBe("top");
  });

  test("a relative URL continues from the position, and a leading slash starts at the root", () => {
    const todos = AppPathBuilder.rootOf(TREE)
      .to("todos");
    expect(todos.parse("7")
      .build()
      .format())
      .toBe("/todos/7");
    expect(todos.parse("/home")
      .build()
      .format())
      .toBe("/home");
  });

  test("the segments are percent-decoded", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .parse("/todos/a%20b")
      .build().segments)
      .toEqual([
        { kind: "segment", value: "todos" },
        { kind: "param", name: "id", value: "a b" },
      ]);
  });

  test("empty query pairs are skipped, and a pair without a value is empty", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .parse("/home?a=1&&flag")
      .build().query)
      .toEqual({ a: "1", flag: "" });
  });

  test("a URL that no route takes throws a no-route ParseError, naming the segment", () => {
    const error = errorOf(() => AppPathBuilder.rootOf(TREE)
      .parse("/nowhere"));
    expect(error.reason)
      .toBe("no-route");
    expect(error.at)
      .toBe("nowhere");
  });

  test("a segment below a route with no children throws no-route", () => {
    expect(errorOf(() => AppPathBuilder.rootOf(TREE)
      .parse("/home/extra")).at)
      .toBe("extra");
  });

  test("a malformed percent-encoding throws a malformed ParseError in the path, query or fragment", () => {
    expect(errorOf(() => AppPathBuilder.rootOf(TREE)
      .parse("/todos/%E0%A4%A")).reason)
      .toBe("malformed");
    expect(errorOf(() => AppPathBuilder.rootOf(TREE)
      .parse("/home?a=%E0%A4%A")).reason)
      .toBe("malformed");
    expect(errorOf(() => AppPathBuilder.rootOf(TREE)
      .parse("/home#%E0%A4%A")).reason)
      .toBe("malformed");
    expect(errorOf(() => AppPathBuilder.rootOf(TREE)
      .parse("/home?%E0%A4%A=1")).reason)
      .toBe("malformed");
  });
});

describe("up", () => {
  test("up goes back to the parent", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("todos", "7")
      .up()
      .build()
      .format())
      .toBe("/todos");
  });

  test("up at the root throws", () => {
    expect(() => AppPathBuilder.rootOf(TREE)
      .up())
      .toThrow("up: already at the root");
  });
});

describe("query and fragment", () => {
  test("query pairs come after the path, and the fragment last", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("home")
      .withQuery({ a: "1" })
      .withQuery({ b: "2" })
      .withFragment("top")
      .build()
      .format())
      .toBe("/home?a=1&b=2#top");
  });

  test("a later query with the same name replaces the earlier value", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("home")
      .withQuery({ a: "1" })
      .withQuery({ a: "2" })
      .build()
      .query)
      .toEqual({ a: "2" });
  });

  test("after a fragment, a query or another fragment throws", () => {
    const hashed = AppPathBuilder.rootOf(TREE)
      .to("home")
      .withFragment("top");
    expect(() => hashed.withQuery({ a: "1" }))
      .toThrow("withQuery: the fragment comes last");
    expect(() => hashed.withFragment("again"))
      .toThrow("withFragment: the fragment is already set");
  });

  test("after a fragment, only build is left", () => {
    expect(() => AppPathBuilder.rootOf(TREE)
      .to("home")
      .withFragment("top")
      .to("todos"))
      .toThrow("the path comes before the query and the fragment");
  });

  test("after a query, a path step throws", () => {
    const queried = AppPathBuilder.rootOf(TREE)
      .to("home")
      .withQuery({ a: "1" });
    expect(() => queried.to("todos"))
      .toThrow("the path comes before the query and the fragment");
    expect(() => queried.parse("/todos"))
      .toThrow("the path comes before the query and the fragment");
    expect(() => queried.up())
      .toThrow("the path comes before the query and the fragment");
    expect(() => queried.relativeTo())
      .toThrow("the path comes before the query and the fragment");
  });

  test("a parse can add a query and fragment after the path", () => {
    expect(AppPathBuilder.rootOf(TREE)
      .to("home")
      .parse("?a=1#x")
      .build()
      .format())
      .toBe("/home?a=1#x");
  });
});

describe("the injected builder", () => {
  test("the root builder starts at the root of the router's routes", () => {
    const { urls, destroy } = builderOver(TREE);
    expect(urls.to("todos", "7")
      .build()
      .format())
      .toBe("/todos/7");
    destroy();
  });

  test("the root builder's relativeTo with no argument starts at the root", () => {
    const { urls, destroy } = builderOver(TREE, "/todos/7");
    expect(urls.relativeTo()
      .to("home")
      .build()
      .format())
      .toBe("/home");
    destroy();
  });

  test("relativeTo a route starts at it, with the parts it was reached by", () => {
    const { urls, router, destroy } = builderOver(TREE, "/todos/7");
    const detail = router.activated()[2];
    if (detail === undefined) {
      throw new Error("no detail level");
    }
    expect(urls.relativeTo(detail)
      .withQuery({ tab: "done" })
      .build()
      .format())
      .toBe("/todos/7?tab=done");
    destroy();
  });

  test("a builder provided in a component: relativeTo with no argument is that component's route", () => {
    const { router, destroy } = builderOver(TREE, "/todos/7");
    const detail = router.activated()[2];
    if (detail === undefined) {
      throw new Error("no detail level");
    }
    const { injector, destroy: destroyAt } = Injector.create({
      providers: [
        provide(Router, { useValue: router }),
        provide(ActivatedRoute, { useValue: detail }),
        providePathBuilder(),
      ],
    });
    const urls = runInInjectionContext(injector, () => inject(APP_PATH_BUILDER));
    expect(urls.relativeTo()
      .withQuery({ tab: "done" })
      .build()
      .format())
      .toBe("/todos/7?tab=done");
    destroyAt();
    destroy();
  });

  test("the builder reads the routes signal on each step, so a change to the tree is seen", () => {
    const routes = signal<Route>({ path: "", children: [{ path: "home", component: Page }] });
    const urls = AppPathBuilder.in(routes);
    expect(() => urls.to("shop"))
      .toThrow(ParseError);
    routes.set({ path: "", children: [{ path: "shop", component: Page }] });
    expect(urls.to("shop")
      .build()
      .format())
      .toBe("/shop");
  });
});
