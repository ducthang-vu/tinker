import { expect, test } from "vitest";
import { inject, Injector, InjectionToken, provide, runInInjectionContext, Task, type Provider } from "@tinker/core";
import { type NavigationAction } from "./actions.ts";
import { Location } from "./location.ts";
import { type Guard, type GuardResult, NavigationCancelledError, NavigationFailedError, NavigationRejectedError, NoRouteError } from "./navigation.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "./platform-location.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";

class Root {}
class Todos {}
class TodoList {}
class TodoDetail {}
class Home {}

/**
 * A platform location that starts at `url`. It records each change the router makes, and `back`
 * moves the browser to a URL the way a back or forward move does, then fires popstate.
 */
function fakePlatform(
  url: string,
  refuse: { readonly push?: boolean; readonly replace?: boolean } = {},
) {
  let current = { url, state: null as unknown };
  const listeners: (() => void)[] = [];
  const changes: string[] = [];
  const platform: PlatformLocation = {
    url: () => current.url,
    state: () => current.state,
    push: (next, state) => {
      if (refuse.push === true) {
        throw new Error("push refused");
      }
      changes.push(`push ${next}`);
      current = { url: next, state };
    },
    replace: (next, state) => {
      if (refuse.replace === true) {
        throw new Error("replace refused");
      }
      changes.push(`replace ${next}`);
      current = { url: next, state };
    },
    onPop: (listener) => {
      listeners.push(listener);
      return () => {};
    },
  };
  return {
    platform,
    changes,
    back(to: string) {
      current = { url: to, state: null };
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

const TODOS_ROUTE: Route = {
  path: "/todos",
  component: Todos,
  children: [
    { path: "", component: TodoList },
    { path: ":id", component: TodoDetail },
  ],
};

/** A router over a tree, in an injector with `providers`, at `url`. */
function routerAt(
  url: string,
  options: {
    readonly root?: Route;
    readonly providers?: readonly Provider[];
    readonly refuse?: { readonly push?: boolean; readonly replace?: boolean };
  } = {},
) {
  const fake = fakePlatform(url, options.refuse);
  const root: Route = options.root ?? {
    path: "",
    component: Root,
    children: [TODOS_ROUTE, { path: "/home", component: Home }],
  };
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, { useFactory: () => new Router(root, inject(Location)) }),
      ...(options.providers ?? []),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  return { router, fake, destroy };
}

/** A guard on the todos route that decides with `decide`. */
function todosGuard(decide: Guard): Route {
  return { ...TODOS_ROUTE, canActivate: [decide] };
}

test("a navigation with synchronous guards has changed the URL when navigate returns", async () => {
  const { router, fake, destroy } = routerAt("/home");
  const result = router.navigate("/todos/7");
  expect(router.url())
    .toBe("/todos/7");
  expect(fake.changes)
    .toEqual(["push /todos/7"]);
  expect((await result).isRight())
    .toBe(true);
  destroy();
});

test("an asynchronous guard holds the URL until its task settles, then the navigation commits", async () => {
  let answer: (result: GuardResult) => void = () => {};
  const pending: Guard = () => Task.from<GuardResult, unknown>((ok) => {
    answer = ok;
  });
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [{ ...TODOS_ROUTE, canActivate: [pending] }, { path: "/home", component: Home }],
    },
  });
  const result = router.navigate("/todos/7");
  expect(router.url())
    .toBe("/home");
  expect(fake.changes)
    .toEqual([]);
  answer(true);
  expect(router.url())
    .toBe("/todos/7");
  expect((await result).isRight())
    .toBe(true);
  destroy();
});

test("a rejected navigation leaves the URL, the activated routes and the history as they were", async () => {
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard(() => false), { path: "/home", component: Home }],
    },
  });
  const before = router.activated();
  const result = await router.navigate("/todos/7", { state: { scroll: 1 } });
  result.match({
    left: (error) => {
      expect(error)
        .toBeInstanceOf(NavigationRejectedError);
    },
    right: () => {
      throw new Error("expected a rejection");
    },
  });
  expect(router.url())
    .toBe("/home");
  expect(router.activated())
    .toBe(before);
  expect(fake.changes)
    .toEqual([]);
  destroy();
});

test("a failed guard reports a NavigationFailedError, and changes nothing", async () => {
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard(() => {
        throw new Error("no session");
      }), { path: "/home", component: Home }],
    },
  });
  const result = await router.navigate("/todos");
  result.match({
    left: (error) => {
      expect(error)
        .toBeInstanceOf(NavigationFailedError);
    },
    right: () => {
      throw new Error("expected a failure");
    },
  });
  expect(fake.changes)
    .toEqual([]);
  destroy();
});

test("a redirect commits the target as the one history entry, and the requested URL is never shown", async () => {
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [
        todosGuard((navigation) => (navigation.url === "/todos/7" ? "/todos/1" : true)),
        { path: "/home", component: Home },
      ],
    },
  });
  await router.navigate("/todos/7");
  expect(router.url())
    .toBe("/todos/1");
  expect(fake.changes)
    .toEqual(["push /todos/1"]);
  destroy();
});

test("a newer navigation cancels an older one that is still waiting for its guard", async () => {
  let answer: (result: GuardResult) => void = () => {};
  const slow: Guard = () => Task.from<GuardResult, unknown>((ok) => {
    answer = ok;
  });
  const { router, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [{ ...TODOS_ROUTE, canActivate: [slow] }, { path: "/home", component: Home }],
    },
  });
  const older = router.navigate("/todos/7");
  const newer = router.navigate("/home");
  const outcome = await older;
  outcome.match({
    left: (error) => {
      expect(error)
        .toBeInstanceOf(NavigationCancelledError);
    },
    right: () => {
      throw new Error("expected a cancellation");
    },
  });
  expect(router.url())
    .toBe("/home");
  answer(true);
  expect(router.url())
    .toBe("/home");
  expect((await newer).isRight())
    .toBe(true);
  destroy();
});

test("navigate to a URL no route matches is a NoRouteError, and the URL does not change", async () => {
  const { router, destroy } = routerAt("/home");
  const result = await router.navigate("/nowhere");
  result.match({
    left: (error) => {
      expect(error)
        .toBeInstanceOf(NoRouteError);
    },
    right: () => {
      throw new Error("expected a failure");
    },
  });
  destroy();
});

test("a guard sees the URL the navigation comes from, and checks every navigation", async () => {
  const froms: string[] = [];
  const guard: Guard = (navigation) => {
    froms.push(navigation.from);
    return true;
  };
  const { router, destroy } = routerAt("/home", {
    root: { path: "", component: Root, children: [todosGuard(guard), { path: "/home", component: Home }] },
  });
  await router.navigate("/todos/7");
  await router.navigate("/todos/8");
  expect(froms)
    .toEqual(["/home", "/todos/7"]);
  destroy();
});

test("the data of a route is its static data", () => {
  const todos: Route = { ...TODOS_ROUTE, data: { title: "Todos" } };
  const { router, destroy } = routerAt("/todos", {
    root: { path: "", component: Root, children: [todos, { path: "/home", component: Home }] },
  });
  expect(router.activated()[1]?.data)
    .toEqual({ title: "Todos" });
  destroy();
});

test("a route redirect moves the navigation, and adds one history entry for the target", async () => {
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [
        { ...TODOS_ROUTE, redirect: (navigation) => (navigation.url === "/todos/7" ? "/todos" : undefined) },
        { path: "/home", component: Home },
      ],
    },
  });
  await router.navigate("/todos/7");
  expect(router.url())
    .toBe("/todos");
  expect(fake.changes)
    .toEqual(["push /todos"]);
  destroy();
});

test("a route with no static data has empty data", () => {
  const { router, destroy } = routerAt("/todos");
  expect(router.activated()[1]?.data)
    .toEqual({});
  destroy();
});

test("a guard can inject a service of the router's injector", async () => {
  const SESSION = new InjectionToken<boolean>("session");
  const { router, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard(() => inject(SESSION)), { path: "/home", component: Home }],
    },
    providers: [provide(SESSION, { useValue: false })],
  });
  const result = await router.navigate("/todos");
  expect(result.isLeft())
    .toBe(true);
  destroy();
});

test("a back move to a URL a guard rejects puts the URL back, and the guard runs once", async () => {
  const seen: string[] = [];
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard((navigation) => {
        seen.push(navigation.url);
        return false;
      }), { path: "/home", component: Home }],
    },
  });
  fake.back("/todos/7");
  expect(seen)
    .toEqual(["/todos/7"]);
  expect(router.url())
    .toBe("/home");
  expect(fake.changes)
    .toEqual(["replace /home"]);
  destroy();
});

test("a back move to a URL that a guard redirects replaces the entry with the target", () => {
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [
        todosGuard((navigation) => (navigation.url === "/todos/7" ? "/todos" : true)),
        { path: "/home", component: Home },
      ],
    },
  });
  fake.back("/todos/7");
  expect(router.url())
    .toBe("/todos");
  expect(fake.changes)
    .toEqual(["replace /todos"]);
  destroy();
});

test("a back move that a guard allows is shown, and adds no entry", () => {
  const { router, fake, destroy } = routerAt("/home");
  fake.back("/todos/7");
  expect(router.url())
    .toBe("/todos/7");
  expect(router.activated()[1]?.route.component)
    .toBe(Todos);
  expect(fake.changes)
    .toEqual([]);
  destroy();
});

test("a start URL a guard rejects shows the root alone, and keeps the URL", () => {
  const { router, destroy } = routerAt("/todos", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard(() => false), { path: "/home", component: Home }],
    },
  });
  expect(router.activated())
    .toHaveLength(1);
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a guard that is also a route's guard is run for the root too", async () => {
  const log: string[] = [];
  const root: Route = {
    path: "",
    component: Root,
    canActivate: [() => {
      log.push("root");
      return true;
    }],
    children: [TODOS_ROUTE, { path: "/home", component: Home }],
  };
  const { router, destroy } = routerAt("/home", { root });
  await router.navigate("/todos");
  expect(log)
    .toEqual(["root", "root"]);
  destroy();
});

/** Records every action the router dispatches from now on. */
function recordActions(router: Router): NavigationAction[] {
  const seen: NavigationAction[] = [];
  router.actions.run({
    next: (action) => {
      seen.push(action);
    },
  });
  return seen;
}

/** The actions as `[navigationId, sequence, type, status]`, for comparing a whole sequence. */
function shape(actions: readonly NavigationAction[]) {
  return actions.map((action) =>
    [action.navigationId, action.sequence, action.type, action.status]);
}

test("a navigation dispatches its steps in order, numbered within one navigation", async () => {
  const { router, destroy } = routerAt("/home");
  const seen = recordActions(router);
  await router.navigate("/todos/7");
  expect(shape(seen))
    .toEqual([
      [2, 1, "NAVIGATION_START", "success"],
      [2, 2, "MATCH_ROUTE", "success"],
      [2, 3, "GUARD_ROUTE", "success"],
      [2, 4, "GUARD_ROUTE", "success"],
      [2, 5, "GUARD_ROUTE", "success"],
      [2, 6, "BROWSER_NAVIGATION", "success"],
      [2, 7, "NAVIGATION_END", "success"],
    ]);
  destroy();
});

test("the browser step of a navigation says it pushed the URL, with its state", async () => {
  const { router, destroy } = routerAt("/home");
  const seen = recordActions(router);
  await router.navigate("/todos/7", { state: { scroll: 3 } });
  const browser = seen.find((action) => action.type === "BROWSER_NAVIGATION");
  expect(browser?.type === "BROWSER_NAVIGATION" && browser.payload)
    .toEqual({ url: "/todos/7", state: { scroll: 3 }, step: "push" });
  destroy();
});

test("a rejected guard fails its GUARD_ROUTE, the routes after it do not run, and the navigation ends failed", async () => {
  const { router, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard(() => false), { path: "/home", component: Home }],
    },
  });
  const seen = recordActions(router);
  await router.navigate("/todos/7");
  expect(shape(seen))
    .toEqual([
      [2, 1, "NAVIGATION_START", "success"],
      [2, 2, "MATCH_ROUTE", "success"],
      [2, 3, "GUARD_ROUTE", "success"],
      [2, 4, "GUARD_ROUTE", "error"],
      [2, 5, "NAVIGATION_END", "error"],
    ]);
  const failed = seen[3];
  expect(failed?.status === "error" && failed.error)
    .toBeInstanceOf(NavigationRejectedError);
  expect(failed?.payload)
    .toEqual({ url: "/todos/7", route: "/todos" });
  destroy();
});

test("a URL no route matches fails its MATCH_ROUTE, and nothing else runs", async () => {
  const { router, destroy } = routerAt("/home");
  const seen = recordActions(router);
  await router.navigate("/nowhere");
  expect(shape(seen))
    .toEqual([
      [2, 1, "NAVIGATION_START", "success"],
      [2, 2, "MATCH_ROUTE", "error"],
      [2, 3, "NAVIGATION_END", "error"],
    ]);
  destroy();
});

test("a route redirect is dispatched as REDIRECT_ROUTE, and the target is matched again", async () => {
  const { router, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [
        { ...TODOS_ROUTE, redirect: (navigation) => (navigation.url === "/todos/7" ? "/todos" : undefined) },
        { path: "/home", component: Home },
      ],
    },
  });
  const seen = recordActions(router);
  await router.navigate("/todos/7");
  const types = seen.map((action) => action.type);
  expect(types.slice(0, 4))
    .toEqual(["NAVIGATION_START", "MATCH_ROUTE", "REDIRECT_ROUTE", "MATCH_ROUTE"]);
  const redirect = seen[2];
  expect(redirect?.type === "REDIRECT_ROUTE" && redirect.payload)
    .toEqual({ url: "/todos/7", target: "/todos", by: "route" });
  expect(types.at(-1))
    .toBe("NAVIGATION_END");
  destroy();
});

test("a guard redirect is the GUARD_ROUTE verdict, then a REDIRECT_ROUTE by the guard", async () => {
  const { router, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [
        todosGuard((navigation) => (navigation.url === "/todos/7" ? "/todos/1" : true)),
        { path: "/home", component: Home },
      ],
    },
  });
  const seen = recordActions(router);
  await router.navigate("/todos/7");
  const verdict = seen.find((action) => action.type === "GUARD_ROUTE" && action.payload.verdict === "/todos/1");
  expect(verdict?.status)
    .toBe("success");
  const redirect = seen.find((action) => action.type === "REDIRECT_ROUTE");
  expect(redirect?.type === "REDIRECT_ROUTE" && redirect.payload.by)
    .toBe("guard");
  destroy();
});

test("a browser that refuses the push fails its BROWSER_NAVIGATION, and the URL does not change", async () => {
  const { router, destroy } = routerAt("/home", { refuse: { push: true } });
  const seen = recordActions(router);
  const result = await router.navigate("/todos/7");
  expect(result.isLeft())
    .toBe(true);
  expect(shape(seen)
    .at(-2))
    .toEqual([2, 6, "BROWSER_NAVIGATION", "error"]);
  expect(router.url())
    .toBe("/home");
  destroy();
});

test("a rejected back move dispatches a BROWSER_NAVIGATION that restores the URL, then ends", () => {
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard(() => false), { path: "/home", component: Home }],
    },
  });
  const seen = recordActions(router);
  fake.back("/todos/7");
  expect(shape(seen))
    .toEqual([
      [2, 1, "NAVIGATION_START", "success"],
      [2, 2, "MATCH_ROUTE", "success"],
      [2, 3, "GUARD_ROUTE", "success"],
      [2, 4, "GUARD_ROUTE", "error"],
      [2, 5, "BROWSER_NAVIGATION", "success"],
      [2, 6, "NAVIGATION_END", "error"],
    ]);
  const restore = seen[4];
  expect(restore?.type === "BROWSER_NAVIGATION" && restore.payload.step)
    .toBe("restore");
  destroy();
});

test("a browser that refuses the restore dispatches it as a failure", () => {
  const { router, fake, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [todosGuard(() => false), { path: "/home", component: Home }],
    },
    refuse: { replace: true },
  });
  const seen = recordActions(router);
  fake.back("/todos/7");
  const restore = seen.find((action) => action.type === "BROWSER_NAVIGATION");
  expect(restore?.status)
    .toBe("error");
  expect(seen.at(-1)?.type)
    .toBe("NAVIGATION_END");
  destroy();
});

test("a navigation cancelled by a newer one ends as cancelled, and each navigation has its own id", async () => {
  let answer: (result: GuardResult) => void = () => {};
  const slow: Guard = () => Task.from<GuardResult, unknown>((ok) => {
    answer = ok;
  });
  const { router, destroy } = routerAt("/home", {
    root: {
      path: "",
      component: Root,
      children: [{ ...TODOS_ROUTE, canActivate: [slow] }, { path: "/home", component: Home }],
    },
  });
  const seen = recordActions(router);
  const older = router.navigate("/todos/7");
  await router.navigate("/home");
  answer(true);
  await older;
  const ended = seen.filter((action) => action.type === "NAVIGATION_END");
  expect(ended.map((action) => [action.navigationId, action.status]))
    .toEqual([[2, "error"], [3, "success"]]);
  const cancelled = ended[0];
  expect(cancelled?.status === "error" && cancelled.error)
    .toBeInstanceOf(NavigationCancelledError);
  destroy();
});
