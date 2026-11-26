import { describe, expect, test } from "vitest";
import { Injector, InjectionToken, inject, provide } from "@tinker/core";
import { type AppPath, type Segment, makeAppPath } from "../destination/app-path.ts";
import { builderOver } from "../destination/test-builder.ts";
import { fail, fromComputation, None, run, Some, succeed, type Task } from "@tinker/functional";
import { ActivatedRoute } from "../state/activated-route.ts";
import type { Route } from "../router/route.ts";
import {
  AllowCommand,
  createDeactivateStep,
  type DeactivateGuard,
  createGuardStep,
  type Guard,
  RedirectCommand,
  RedirectPayload,
  type RouteGuardCommand,
  StopCommand,
  StopPayload,
} from "./guard-step.ts";
import type { MatchedRequest } from "./request.ts";
import { Redirect, type Stop } from "./stop.ts";

/** A destination of literal segments for a path such as "/todos/7". */
function destinationOf(path: string): AppPath {
  return makeAppPath(
    path.split("/")
      .filter((segment) => segment !== "")
      .map((value): Segment => ({ kind: "segment", value })),
    {},
    undefined,
  );
}

const targets = [{ path: "/login", component: class {} }, { path: "/home", component: class {} }, { path: "/elsewhere", component: class {} }] as const;

/** A destination for one of the targets above, built by the URL builder. */
function to(path: "login" | "home" | "elsewhere") {
  return builderOver(targets)
    .to(path)
    .build();
}

/** A matched request for `url`, over the routes (root first). */
function matchedAt(url: string, routes: readonly Route[]): MatchedRequest {
  return {
    id: 1,
    destination: destinationOf(url),
    state: null,
    arrival: "push",
    redirectFrom: [], activatedRoutes: [], trace: [],
    chain: routes.map((route) => ({ route, params: {}, segments: [] })),
  };
}

/** The stop of a guard step's outcome, or `undefined` when every guard allowed. */
function stopOf(task: Task<MatchedRequest, Stop>): Stop | undefined {
  const seen: { ok?: MatchedRequest; error?: Stop }[] = [];
  run(task, {
    ok: (value) => {
      seen.push({ ok: value });
    },
    error: (error) => {
      seen.push({ error });
    },
  });
  return seen[0]?.error;
}

const page = { path: "/todos", component: class {} };

/** The guard that always allows. */
const allow = (): Task<RouteGuardCommand, never> => succeed(new AllowCommand());

/** A guard that stops, with a reason. */
const stop = (reason?: string): Task<RouteGuardCommand, never> =>
  succeed(new StopCommand(new StopPayload(reason)));

describe("the guard step", () => {
  test("when every guard allows, the step succeeds with the request", () => {
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [allow] }];
    const matched = matchedAt("/todos", routes);
    expect(stopOf(step(matched)))
      .toBeUndefined();
  });

  test("a route with no guards allows", () => {
    const step = createGuardStep(Injector.create().injector);
    expect(stopOf(step(matchedAt("/todos", [page]))))
      .toBeUndefined();
  });

  test("guards run root first, each route's in order, and the first that does not allow stops", () => {
    const log: string[] = [];
    const step = createGuardStep(Injector.create().injector);
    const logged = (name: string, command: () => Task<RouteGuardCommand, never>): Guard => () => {
      log.push(name);
      return command();
    };
    const routes: Route[] = [
      { path: "", component: class {}, canActivate: [logged("root", allow)] },
      { ...page, canActivate: [logged("child-1", allow), logged("child-2", stop), logged("child-3", allow)] },
    ];
    const rejected = stopOf(step(matchedAt("/todos", routes)));
    expect(log)
      .toEqual(["root", "child-1", "child-2"]);
    expect(rejected)
      .toMatchObject({ kind: "rejected", reason: "GUARD" });
  });

  test("a STOP carries its reason to the rejection, as the guard command", () => {
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => stop("not signed in")] }];
    expect(stopOf(step(matchedAt("/todos", routes))))
      .toMatchObject({ kind: "rejected", reason: "GUARD", guard: { payload: { reason: "not signed in" } } });
  });

  test("a REDIRECT stops with a Redirect to its path", () => {
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{
      ...page,
      canActivate: [() => succeed(new RedirectCommand(new RedirectPayload(to("login"), "log in first")))],
    }];
    const redirect = stopOf(step(matchedAt("/todos", routes)));
    expect((redirect as Redirect).target)
      .toEqual(to("login"));
  });

  test("a guard that throws stops with a Failed, keeping the throw", () => {
    const thrown = new Error("no session");
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => {
      throw thrown;
    }] }];
    const rejected = stopOf(step(matchedAt("/todos", routes)));
    expect(rejected)
      .toMatchObject({ kind: "rejected", reason: "FAILED" });
    expect((rejected as { cause: unknown }).cause)
      .toBe(thrown);
  });

  test("a guard that returns a task is waited for, and its command decides", () => {
    let answer: (command: RouteGuardCommand) => void = () => {};
    const waiting = fromComputation<RouteGuardCommand, unknown>((ok) => {
      answer = ok;
    });
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => waiting] }];
    const seen: (Stop | undefined)[] = [];
    run(step(matchedAt("/todos", routes)), {
      ok: () => {
        seen.push(undefined);
      },
      error: (error) => {
        seen.push(error);
      },
    });
    expect(seen)
      .toEqual([]);
    answer(new StopCommand(new StopPayload()));
    expect(seen[0])
      .toMatchObject({ kind: "rejected", reason: "GUARD" });
  });

  test("a guard's task that fails stops with a Failed", () => {
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => fail(new Error("offline"))] }];
    expect(stopOf(step(matchedAt("/todos", routes))))
      .toMatchObject({ kind: "rejected", reason: "FAILED" });
  });

  test("a guard runs in the injection context of the router, so it can inject", () => {
    const SESSION = new InjectionToken<boolean>("session");
    const { injector } = Injector.create({ providers: [provide(SESSION, { useValue: false })] });
    const step = createGuardStep(injector);
    const routes: Route[] = [{
      ...page,
      canActivate: [() => (inject(SESSION) ? allow() : stop())],
    }];
    expect(stopOf(step(matchedAt("/todos", routes))))
      .toMatchObject({ kind: "rejected", reason: "GUARD" });
  });

  test("a guard receives the matched request", () => {
    const seen: string[] = [];
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [(request) => {
      seen.push(request.destination.format());
      return allow();
    }] }];
    stopOf(step(matchedAt("/todos", routes)));
    expect(seen)
      .toEqual(["/todos"]);
  });

  test("each guard's command is recorded in the trace of the request", () => {
    const step = createGuardStep(Injector.create().injector);
    const matched = matchedAt("/todos", [page]);
    const routes: Route[] = [{ ...page, canActivate: [allow] }];
    const seen: MatchedRequest[] = [];
    run(step(matchedAt("/todos", routes)), { ok: (value) => {
      seen.push(value);
    } });
    expect(seen[0]?.trace)
      .toEqual([{ step: "ACTIVATE_GUARD", route: "/todos", command: "ALLOW" }]);
    expect(matched.trace)
      .toEqual([]);
  });
});

describe("the deactivate step", () => {
  /** The parent of the next activated route: the last one made, or None at the root. */
  function parentOf(made: readonly ActivatedRoute[]) {
    const last = made[made.length - 1];
    return last === undefined ? None.of() : Some.of(last);
  }

  /** The activated routes of a chain of routes, root first, as the router holds them. */
  function activatedOf(routes: readonly Route[]): ActivatedRoute[] {
    return routes.reduce<ActivatedRoute[]>(
      (made, route) => [
        ...made,
        new ActivatedRoute(route, {}, [], parentOf(made)),
      ],
      [],
    );
  }

  test("the leaving routes' guards run from the last route to the first, in sequence", () => {
    const log: string[] = [];
    const logged = (name: string): DeactivateGuard => () => {
      log.push(name);
      return allow();
    };
    const root: Route = { path: "", component: class {}, canDeactivate: [logged("root")] };
    const child: Route = { ...page, canDeactivate: [logged("child-1"), logged("child-2")] };
    const matched = { ...matchedAt("/todos", [root, child]), activatedRoutes: activatedOf([root, child]) };
    const step = createDeactivateStep(Injector.create().injector);
    expect(stopOf(step(matched)))
      .toBeUndefined();
    expect(log)
      .toEqual(["child-1", "child-2", "root"]);
  });

  test("a STOP from a leaving route stops the step, and the routes above it are not asked", () => {
    const log: string[] = [];
    const root: Route = { path: "", component: class {}, canDeactivate: [() => {
      log.push("root");
      return allow();
    }] };
    const child: Route = { ...page, canDeactivate: [() => {
      log.push("child");
      return succeed(new StopCommand(new StopPayload("unsaved changes")));
    }] };
    const matched = { ...matchedAt("/todos", [root, child]), activatedRoutes: activatedOf([root, child]) };
    const step = createDeactivateStep(Injector.create().injector);
    expect(stopOf(step(matched)))
      .toMatchObject({ kind: "rejected", reason: "GUARD", route: "/todos", guard: { payload: { reason: "unsaved changes" } } });
    expect(log)
      .toEqual(["child"]);
  });

  test("each deactivate command is recorded in the trace, as a deactivate step", () => {
    const child: Route = { ...page, canDeactivate: [allowLeaving] };
    const matched = { ...matchedAt("/todos", [child]), activatedRoutes: activatedOf([child]) };
    const step = createDeactivateStep(Injector.create().injector);
    const seen: MatchedRequest[] = [];
    run(step(matched), { ok: (value) => {
      seen.push(value);
    } });
    expect(seen[0]?.trace)
      .toEqual([{ step: "DEACTIVATE_GUARD", route: "/todos", command: "ALLOW" }]);
  });
});

/** A deactivate guard that allows. */
const allowLeaving: DeactivateGuard = () => allow();
