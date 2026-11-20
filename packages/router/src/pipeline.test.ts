import { describe, expect, test } from "vitest";
import {
  inject,
  InjectionToken,
  Injector,
  Maybe,
  provide,
  type Provider,
  Task,
} from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { type Guard, type GuardResult, NavigationFailedError, NavigationRejectedError, NoRouteError } from "./navigation.ts";
import { type PipelineContext, type Plan, planNavigation } from "./pipeline.ts";
import type { Route } from "./route.ts";

class Root {}
class Home {}
class Todos {}
class TodoList {}
class TodoDetail {}

/** The outcome of a task that settled as soon as it ran. `undefined` when it has not settled. */
type Settled<T> = { readonly ok: T } | { readonly error: unknown };

function settledNow<T>(task: Task<T, unknown>): Settled<T> | undefined {
  const seen: Settled<T>[] = [];
  task.run({
    ok: (value) => seen.push({ ok: value }),
    error: (error) => seen.push({ error }),
  });
  return seen[0];
}

/** The plan of a navigation that settled now, or the error it failed with. */
function planNow(context: PipelineContext, url: string, state: unknown = null): Settled<Plan> {
  const settled = settledNow(planNavigation(context, url, state));
  if (settled === undefined) {
    throw new Error("expected the navigation to settle");
  }
  return settled;
}

/** The error of a settled navigation: the test fails when it did not fail. */
function errorOf(settled: Settled<Plan>): unknown {
  if (!("error" in settled)) {
    throw new Error("expected a failure");
  }
  return settled.error;
}

function treeWith(
  parts: { readonly root?: Partial<Route>; readonly todos?: Partial<Route> } = {},
): Route {
  return {
    path: "",
    component: Root,
    ...parts.root,
    children: [
      {
        path: "/todos",
        component: Todos,
        ...parts.todos,
        children: [
          { path: "", component: TodoList },
          { path: ":id", component: TodoDetail },
        ],
      },
      { path: "/home", component: Home },
    ],
  };
}

/** A context over `root`, in an injector with `providers`, at `activated` (the root alone). */
function contextFor(
  root: Route,
  options: {
    readonly providers?: readonly Provider[];
    readonly activated?: readonly ActivatedRoute[];
    readonly from?: string;
  } = {},
): PipelineContext {
  const { injector } = Injector.create({ providers: options.providers ?? [] });
  const rootRoute = new ActivatedRoute(root, {}, [], Maybe.none());
  return {
    root,
    injector,
    activated: options.activated ?? [rootRoute],
    from: options.from ?? "",
  };
}

describe("matching and the plan", () => {
  test("a URL with no guards plans its matched levels, root first, with no values", () => {
    const settled = planNow(contextFor(treeWith()), "/todos/7?tab=done");
    expect("ok" in settled)
      .toBe(true);
    const plan = "ok" in settled ? settled.ok : undefined;
    expect(plan?.url)
      .toBe("/todos/7?tab=done");
    expect(plan?.chain.map((level) => level.route.component))
      .toEqual([Root, Todos, TodoDetail]);
    expect(plan?.kept)
      .toEqual([]);
  });

  test("the plan keeps the state it was given", () => {
    const settled = planNow(contextFor(treeWith()), "/home", { scroll: 3 });
    expect("ok" in settled && settled.ok.state)
      .toEqual({ scroll: 3 });
  });

  test("a URL no route matches fails with a NoRouteError", () => {
    const settled = planNow(contextFor(treeWith()), "/nowhere");
    expect(errorOf(settled))
      .toBeInstanceOf(NoRouteError);
  });
});

describe("guards", () => {
  test("a guard gets the navigation: its URL, state, leaf match and the URL it comes from", () => {
    const seen: unknown[] = [];
    const guard: Guard = (navigation) => {
      seen.push(navigation);
      return true;
    };
    planNow(contextFor(treeWith({ todos: { canActivate: [guard] } }), { from: "/home" }), "/todos/7", { x: 1 });
    expect(seen)
      .toEqual([
        {
          url: "/todos/7",
          state: { x: 1 },
          match: { route: expect.anything(), params: { id: "7" } },
          from: "/home",
        },
      ]);
  });

  test("the guards of every matched level run, the root's first, each route's in order", () => {
    const log: string[] = [];
    const logged = (name: string): Guard => () => {
      log.push(name);
      return true;
    };
    const root = treeWith({ root: { canActivate: [logged("root-1"), logged("root-2")] } });
    const todos = root.children?.[0] as Route;
    const withGuards: Route = {
      ...root,
      children: [{ ...todos, canActivate: [logged("todos")] }, ...(root.children?.slice(1) ?? [])],
    };
    planNow(contextFor(withGuards), "/todos/7");
    expect(log)
      .toEqual(["root-1", "root-2", "todos"]);
  });

  test("a guard that says false rejects the navigation, and the guards after it do not run", () => {
    const log: string[] = [];
    const deny: Guard = () => {
      log.push("deny");
      return false;
    };
    const later: Guard = () => {
      log.push("later");
      return true;
    };
    const settled = planNow(contextFor(treeWith({ todos: { canActivate: [deny, later] } })), "/todos/7");
    expect(errorOf(settled))
      .toBeInstanceOf(NavigationRejectedError);
    expect(log)
      .toEqual(["deny"]);
  });

  test("a guard that returns a string redirects: the target is planned, and its guards run too", () => {
    const seen: string[] = [];
    const root = treeWith({
      root: {
        canActivate: [
          (navigation) => {
            seen.push(navigation.url);
            return navigation.url === "/home" ? "/todos" : true;
          },
        ],
      },
    });
    const settled = planNow(contextFor(root), "/home", { kept: true });
    expect("ok" in settled && settled.ok.url)
      .toBe("/todos");
    expect("ok" in settled && settled.ok.state)
      .toEqual({ kept: true });
    expect(seen)
      .toEqual(["/home", "/todos"]);
  });

  test("redirects that never end fail the navigation, after the cap", () => {
    const loop: Guard = () => "/home";
    const root = treeWith({ root: { canActivate: [loop] } });
    const settled = planNow(contextFor(root), "/todos");
    const error = errorOf(settled);
    expect(error)
      .toBeInstanceOf(NavigationFailedError);
    expect((error as NavigationFailedError).cause)
      .toEqual(new Error("More than 10 redirects"));
  });

  test("a redirect to a URL no route matches fails with a NoRouteError", () => {
    const toNowhere: Guard = () => "/nowhere";
    const settled = planNow(contextFor(treeWith({ todos: { canActivate: [toNowhere] } })), "/todos");
    expect(errorOf(settled))
      .toBeInstanceOf(NoRouteError);
  });

  test("a guard that throws fails the navigation, and keeps the throw as the cause", () => {
    const thrown = new Error("no session");
    const guard: Guard = () => {
      throw thrown;
    };
    const error = errorOf(planNow(contextFor(treeWith({ todos: { canActivate: [guard] } })), "/todos"));
    expect(error)
      .toBeInstanceOf(NavigationFailedError);
    expect((error as NavigationFailedError).cause)
      .toBe(thrown);
  });

  test("a guard whose task fails fails the navigation", () => {
    const guard: Guard = () => Task.fail(new Error("server down"));
    const error = errorOf(planNow(contextFor(treeWith({ todos: { canActivate: [guard] } })), "/todos"));
    expect(error)
      .toBeInstanceOf(NavigationFailedError);
  });

  test("a guard that returns a task is waited for: the navigation settles when the task does", () => {
    let answer: (result: GuardResult) => void = () => {};
    const guard: Guard = () => Task.from<GuardResult, unknown>((ok) => {
      answer = ok;
    });
    const planned: Settled<Plan>[] = [];
    planNavigation(contextFor(treeWith({ todos: { canActivate: [guard] } })), "/todos", null)
      .run({
        ok: (plan) => planned.push({ ok: plan }),
        error: (error) => planned.push({ error }),
      });
    expect(planned)
      .toEqual([]);
    answer(true);
    expect(planned.map((settled) => "ok" in settled && settled.ok.url))
      .toEqual(["/todos"]);
  });

  test("a guard can call inject: it runs in the injection context of the router", () => {
    const TOKEN = new InjectionToken<string>("session");
    const guard: Guard = () => inject(TOKEN) === "signed-in";
    const context = contextFor(treeWith({ todos: { canActivate: [guard] } }), {
      providers: [provide(TOKEN, { useValue: "signed-in" })],
    });
    expect("ok" in planNow(context, "/todos"))
      .toBe(true);
  });
});

describe("redirects of a route", () => {
  test("a route redirect that returns a URL sends the navigation there, before any guard runs", () => {
    const guarded: string[] = [];
    const root = treeWith({
      todos: {
        redirect: () => "/home",
        canActivate: [() => {
          guarded.push("guard");
          return true;
        }],
      },
    });
    const plan = planNow(contextFor(root), "/todos/7");
    expect("ok" in plan && plan.ok.url)
      .toBe("/home");
    expect(guarded)
      .toEqual([]);
  });

  test("a redirect that returns undefined leaves the navigation to the guards", () => {
    const root = treeWith({
      todos: { redirect: () => undefined },
    });
    const plan = planNow(contextFor(root), "/todos");
    expect("ok" in plan && plan.ok.url)
      .toBe("/todos");
  });

  test("a redirect gets the navigation", () => {
    const seen: string[] = [];
    const root = treeWith({
      todos: {
        redirect: (navigation) => {
          seen.push(navigation.url);
          return undefined;
        },
      },
    });
    planNow(contextFor(root), "/todos/7");
    expect(seen)
      .toEqual(["/todos/7"]);
  });

  test("the routes are asked root first, and the first redirect that returns a URL decides", () => {
    const asked: string[] = [];
    const root = treeWith({
      root: {
        redirect: (navigation) => {
          asked.push("root");
          return navigation.url === "/todos" ? "/home" : undefined;
        },
      },
      todos: {
        redirect: () => {
          asked.push("todos");
          return "/elsewhere";
        },
      },
    });
    const plan = planNow(contextFor(root), "/todos");
    expect("ok" in plan && plan.ok.url)
      .toBe("/home");
    expect(asked[0])
      .toBe("root");
    expect(asked)
      .not.toContain("todos");
  });

  test("a redirect can call inject: it runs in the injection context of the router", () => {
    const TARGET = new InjectionToken<string>("target");
    const root = treeWith({
      todos: { redirect: () => inject(TARGET) },
    });
    const plan = planNow(contextFor(root, {
      providers: [provide(TARGET, { useValue: "/home" })],
    }), "/todos");
    expect("ok" in plan && plan.ok.url)
      .toBe("/home");
  });

  test("a redirect that throws fails the navigation", () => {
    const root = treeWith({
      todos: {
        redirect: () => {
          throw new Error("no config");
        },
      },
    });
    expect(errorOf(planNow(contextFor(root), "/todos")))
      .toBeInstanceOf(NavigationFailedError);
  });

  test("redirects that never end fail the navigation, as guard redirects do", () => {
    const root = treeWith({
      todos: { redirect: () => "/todos" },
    });
    const error = errorOf(planNow(contextFor(root), "/todos"));
    expect((error as NavigationFailedError).cause)
      .toEqual(new Error("More than 10 redirects"));
  });
});
