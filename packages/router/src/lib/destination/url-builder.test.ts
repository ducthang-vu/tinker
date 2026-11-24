import { describe, expect, test } from "vitest";
import { None, Some } from "@tinker/functional";
import { ActivatedRoute } from "../state/activated-route.ts";
import type { Route } from "../router/route.ts";
import { ParseError, UrlBuilder } from "./url-builder.ts";

/** A route tree, declared as a constant so its paths keep their literal types. */
const tree = [
  { path: "/todos", children: [{ path: "/:id" }] },
  { path: "/home" },
] as const;

describe("building a path", () => {
  test("segments and params compose in order", () => {
    const url = UrlBuilder.for(tree)
      .withSegment("todos")
      .withParam("id", "7")
      .build();
    expect(url.format())
      .toBe("/todos/7");
  });

  test("a segment can be given with or without its leading slash in the tree", () => {
    expect(UrlBuilder.for(tree)
      .withSegment("home")
      .build()
      .format())
      .toBe("/home");
  });

  test("a param value is percent-encoded", () => {
    const url = UrlBuilder.for(tree)
      .withSegment("todos")
      .withParam("id", "a b/c")
      .build();
    expect(url.format())
      .toBe("/todos/a%20b%2Fc");
  });

  test("an empty path is the root", () => {
    expect(UrlBuilder.for(tree)
      .build()
      .format())
      .toBe("/");
  });

  test("a segment that no child has throws, naming it", () => {
    const untyped = UrlBuilder.for(tree) as unknown as { withSegment(s: string): unknown };
    expect(() => untyped.withSegment("stringA"))
      .toThrow("no segment \"stringA\" under \"\"");
  });

  test("a param that the route does not declare throws", () => {
    const todos = UrlBuilder.for(tree)
      .withSegment("todos") as unknown as {
      withParam(name: string, value: string): unknown;
    };
    expect(() => todos.withParam("name", "x"))
      .toThrow("no param \"name\" under \"todos\"");
  });

  test("up goes back to the parent, and throws at the root", () => {
    const url = UrlBuilder.for(tree)
      .withSegment("todos")
      .withParam("id", "7")
      .up()
      .build();
    expect(url.format())
      .toBe("/todos");
    expect(() => (UrlBuilder.for(tree) as unknown as { up(): unknown }).up())
      .toThrow("up: already at the root");
  });
});

describe("query and fragment", () => {
  test("query pairs come after the path, in order, and the fragment last", () => {
    const url = UrlBuilder.for(tree)
      .withSegment("todos")
      .withParam("id", "7")
      .withQuery("tab", "done")
      .withQuery("sort", "asc")
      .withFragment("top")
      .build();
    expect(url.format())
      .toBe("/todos/7?tab=done&sort=asc#top");
  });

  test("a query value is percent-encoded", () => {
    const url = UrlBuilder.for(tree)
      .withSegment("home")
      .withQuery("q", "a&b")
      .build();
    expect(url.format())
      .toBe("/home?q=a%26b");
  });

  test("after a fragment, a query or another fragment throws", () => {
    const withFragment = UrlBuilder.for(tree)
      .withSegment("home")
      .withFragment("top") as unknown as {
      withQuery(name: string, value: string): unknown;
      withFragment(value: string): unknown;
    };
    expect(() => withFragment.withQuery("a", "1"))
      .toThrow("withQuery: the fragment comes last");
    expect(() => withFragment.withFragment("again"))
      .toThrow("withFragment: the fragment is already set");
  });

  test("after a query, a path step throws", () => {
    const withQuery = UrlBuilder.for(tree)
      .withSegment("home")
      .withQuery("a", "1") as unknown as {
      withSegment(s: string): unknown;
    };
    expect(() => withQuery.withSegment("todos"))
      .toThrow("the path comes before the query and the fragment");
  });
});

describe("types, checked again at run time", () => {
  test("a segment the tree does not have is a type error, and throws", () => {
    expect(() => {
      UrlBuilder.for(tree)
        // @ts-expect-error "stringA" is not a child of the root
        .withSegment("stringA");
    })
      .toThrow("no segment \"stringA\" under \"\"");
  });

  test("a param the route does not declare is a type error, and throws", () => {
    expect(() => {
      UrlBuilder.for(tree)
        .withSegment("todos")
        // @ts-expect-error "name" is not a param of "todos"
        .withParam("name", "x");
    })
      .toThrow("no param \"name\" under \"todos\"");
  });

  test("a path step after a query is a type error, and throws", () => {
    expect(() => {
      // @ts-expect-error the path comes before the query
      UrlBuilder.for(tree)
        .withSegment("home")
        .withQuery("a", "1")
        .withSegment("todos");
    })
      .toThrow("the path comes before the query and the fragment");
  });

  test("a query after a fragment is a type error, and throws", () => {
    expect(() => {
      // @ts-expect-error the fragment comes last
      UrlBuilder.for(tree)
        .withSegment("home")
        .withFragment("top")
        .withQuery("a", "1");
    })
      .toThrow("withQuery: the fragment comes last");
  });

  test("up at the root is a type error, and throws", () => {
    expect(() => {
      // @ts-expect-error there is no parent of the root
      UrlBuilder.for(tree)
        .up();
    })
      .toThrow("up: already at the root");
  });
});

describe("edge cases", () => {
  test("a route with no children has no segments under it", () => {
    const untyped = UrlBuilder.for(tree)
      .withSegment("home") as unknown as {
      withSegment(segment: string): unknown;
    };
    expect(() => untyped.withSegment("anything"))
      .toThrow("no segment \"anything\" under \"home\"");
  });

  test("a relative start without a value for its param writes the param empty", () => {
    const root: Route = { path: "", children: [{ path: "/:id" }] };
    const rootRoute = new ActivatedRoute(root, {}, [], None.of());
    const idRoute = new ActivatedRoute(root.children?.[0] as Route, {}, [], Some.of(rootRoute));
    expect(UrlBuilder.from(idRoute)
      .build()
      .format())
      .toBe("/");
  });
});

describe("the partial destination", () => {
  test("shows what has been built, before build", () => {
    const partial = UrlBuilder.for(tree)
      .withSegment("todos")
      .withParam("id", "7").partial;
    expect(partial.parts)
      .toEqual([
        { kind: "segment", value: "todos" },
        { kind: "param", name: "id", value: "7" },
      ]);
  });
});

describe("from an activated route", () => {
  const home: Route = { path: "/home" };
  const todos: Route = { path: "/todos", children: [{ path: "/:id" }] };
  const root: Route = { path: "", children: [todos, home] };

  /** The activated route chain for `/todos/7`: root, todos, and the id param. */
  function chain() {
    const rootRoute = new ActivatedRoute(root, {}, [], None.of());
    const todosRoute = new ActivatedRoute(todos, {}, ["todos"], Some.of(rootRoute));
    const idRoute = new ActivatedRoute(
      todos.children?.[0] as Route,
      { id: "7" },
      ["7"],
      Some.of(todosRoute),
    );
    return { todosRoute, idRoute };
  }

  test("starts at the activated route, with its path already written", () => {
    const { idRoute } = chain();
    expect(UrlBuilder.from(idRoute)
      .build()
      .format())
      .toBe("/todos/7");
  });

  test("up moves to the parent of the activated route", () => {
    const { idRoute } = chain();
    expect(UrlBuilder.from(idRoute)
      .up()
      .build()
      .format())
      .toBe("/todos");
  });

  test("a builder from an activated route can add a param and a query", () => {
    const { todosRoute } = chain();
    const url = UrlBuilder.from(todosRoute)
      .withParam("id", "9")
      .withQuery("tab", "done")
      .build();
    expect(url.format())
      .toBe("/todos/9?tab=done");
  });

  test("the partial shows the start point, and reading it does not change the builder", () => {
    const { idRoute } = chain();
    const builder = UrlBuilder.from(idRoute);
    expect(builder.partial.parts)
      .toHaveLength(2);
    expect(builder.build()
      .format())
      .toBe("/todos/7");
  });
});

/** The error a parse throws, or the test fails when it does not throw. */
function parseErrorOf(raw: string): ParseError {
  try {
    UrlBuilder.for(tree)
      .parse(raw);
  } catch (error) {
    if (error instanceof ParseError) {
      return error;
    }
    throw error;
  }
  throw new Error(`expected ${raw} to fail`);
}

describe("parse", () => {
  test("a URL of the tree parses to a destination, with its params as params", () => {
    expect(UrlBuilder.for(tree)
      .parse("/todos/7").parts)
      .toEqual([
        { kind: "segment", value: "todos" },
        { kind: "param", name: "id", value: "7" },
      ]);
  });

  test("the query and the fragment are parsed and decoded", () => {
    const destination = UrlBuilder.for(tree)
      .parse("/todos/a%20b?tab=done&q=x%26y#top");
    expect(destination.format())
      .toBe("/todos/a%20b?tab=done&q=x%26y#top");
    expect(destination.query)
      .toEqual([["tab", "done"], ["q", "x&y"]]);
  });

  test("a destination the builder makes parses back to the same URL", () => {
    const built = UrlBuilder.for(tree)
      .withSegment("todos")
      .withParam("id", "7")
      .withQuery("a", "1")
      .build();
    expect(UrlBuilder.for(tree)
      .parse(built.format())
      .format())
      .toBe(built.format());
  });

  test("parsing starts at the root, whatever the builder's position", () => {
    const fromTodos = UrlBuilder.for(tree)
      .withSegment("todos");
    expect(fromTodos.parse("/home")
      .format())
      .toBe("/home");
  });

  test("a segment no route matches throws a no-route ParseError", () => {
    const error = parseErrorOf("/nowhere");
    expect(error.reason)
      .toBe("no-route");
    expect(error.at)
      .toBe("nowhere");
  });

  test("a malformed percent-encoding throws a malformed ParseError", () => {
    expect(parseErrorOf("/todos/%E0%A4%A").reason)
      .toBe("malformed");
  });

  test("a path that goes below a route with no children throws no-route", () => {
    expect(parseErrorOf("/home/extra").reason)
      .toBe("no-route");
  });

  test("an empty path is the root, when the tree has an empty route for it", () => {
    expect(UrlBuilder.for([{ path: "" }, ...tree] as const)
      .parse("/")
      .format())
      .toBe("/");
  });

  test("an empty path matches no route when the tree has no empty route", () => {
    expect(parseErrorOf("/").reason)
      .toBe("no-route");
  });

  test("a malformed query pair or fragment throws malformed", () => {
    expect(parseErrorOf("/home?a=%E0%A4%A").reason)
      .toBe("malformed");
    expect(parseErrorOf("/home#%E0%A4%A").reason)
      .toBe("malformed");
  });

  test("an empty query pair is skipped, and a pair without a value has an empty value", () => {
    expect(UrlBuilder.for(tree)
      .parse("/home?&flag&a=1").query)
      .toEqual([["flag", ""], ["a", "1"]]);
  });
});

describe("the parent is up, and .. is not a segment", () => {
  test("`..` in a raw URL is a segment no route matches", () => {
    expect(parseErrorOf("/todos/7/../7").reason)
      .toBe("no-route");
  });

  test("withSegment('..') is a type error, and throws", () => {
    expect(() => {
      UrlBuilder.for(tree)
        .withSegment("todos")
        // @ts-expect-error "..\" is not a child: up() goes to the parent"
        .withSegment("..");
    })
      .toThrow("no segment \"..\" under \"todos\"");
  });

  test("up() goes to the parent", () => {
    expect(UrlBuilder.for(tree)
      .withSegment("todos")
      .withParam("id", "7")
      .up()
      .build()
      .format())
      .toBe("/todos");
  });
});
