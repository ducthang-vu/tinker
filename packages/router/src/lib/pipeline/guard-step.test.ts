import { describe, expect, test } from "vitest";
import { Injector, InjectionToken, inject, provide } from "@tinker/core";
import { UrlBuilder } from "../destination/url-builder.ts";
import { fail, fromComputation, run, type Task } from "@tinker/functional";
import type { Route } from "../router/route.ts";
import { createGuardStep, type Guard, type GuardResult } from "./guard-step.ts";
import type { MatchedRequest } from "./request.ts";
import { Redirect, type Stop } from "./stop.ts";
import { Destination, type Part } from "../destination/url-builder.ts";

/** A destination of literal segments for a path such as "/todos/7". */
function destinationOf(path: string): Destination {
  return Destination.make(
    path.split("/")
      .filter((segment) => segment !== "")
      .map((value): Part => ({ kind: "segment", value })),
    [],
    undefined,
  );
}

const targets = [{ path: "/login" }, { path: "/home" }, { path: "/elsewhere" }] as const;

/** A destination for one of the targets above, built by the URL builder. */
function to(path: "login" | "home" | "elsewhere") {
  return UrlBuilder.for(targets)
    .withSegment(path)
    .build();
}

/** A matched request for `url`, over the routes (root first). */
function matchedAt(url: string, routes: readonly Route[]): MatchedRequest {
  return {
    id: 1,
    destination: destinationOf(url),
    state: null,
    arrival: "push",
    redirectFrom: [],
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

describe("the guard step", () => {
  test("when every guard allows, the step succeeds with the request", () => {
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => true] }];
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
    const logged = (name: string, answer: GuardResult): Guard => () => {
      log.push(name);
      return answer;
    };
    const routes: Route[] = [
      { path: "", component: class {}, canActivate: [logged("root", true)] },
      { ...page, canActivate: [logged("child-1", true), logged("child-2", false), logged("child-3", true)] },
    ];
    const stop = stopOf(step(matchedAt("/todos", routes)));
    expect(log)
      .toEqual(["root", "child-1", "child-2"]);
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "guard" });
  });

  test("a guard that returns a URL stops with a Redirect to it", () => {
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => to("login")] }];
    expect(stopOf(step(matchedAt("/todos", routes))))
      .toEqual(Redirect.of(matchedAt("/todos", routes), to("login")));
  });

  test("a guard that throws stops with a Failed, keeping the throw", () => {
    const thrown = new Error("no session");
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => {
      throw thrown;
    }] }];
    const stop = stopOf(step(matchedAt("/todos", routes)));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "failed" });
    expect((stop as { cause: unknown }).cause)
      .toBe(thrown);
  });

  test("a guard that returns a task is waited for, and its answer decides", () => {
    let answer: (result: GuardResult) => void = () => {};
    const waiting = fromComputation<GuardResult, unknown>((ok) => {
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
    answer(false);
    expect(seen[0])
      .toMatchObject({ kind: "rejected", reason: "guard" });
  });

  test("a guard's task that fails stops with a Failed", () => {
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [() => fail(new Error("offline"))] }];
    expect(stopOf(step(matchedAt("/todos", routes))))
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });

  test("a guard runs in the injection context of the router, so it can inject", () => {
    const SESSION = new InjectionToken<boolean>("session");
    const { injector } = Injector.create({ providers: [provide(SESSION, { useValue: false })] });
    const step = createGuardStep(injector);
    const routes: Route[] = [{ ...page, canActivate: [() => inject(SESSION)] }];
    expect(stopOf(step(matchedAt("/todos", routes))))
      .toMatchObject({ kind: "rejected", reason: "guard" });
  });

  test("a guard receives the matched request", () => {
    const seen: string[] = [];
    const step = createGuardStep(Injector.create().injector);
    const routes: Route[] = [{ ...page, canActivate: [(request) => {
      seen.push(request.destination.format());
      return true;
    }] }];
    stopOf(step(matchedAt("/todos", routes)));
    expect(seen)
      .toEqual(["/todos"]);
  });

  test("succeed is the step's own value: the step returns the request on success", () => {
    const step = createGuardStep(Injector.create().injector);
    const matched = matchedAt("/todos", [page]);
    const seen: MatchedRequest[] = [];
    run(step(matched), { ok: (value) => {
      seen.push(value);
    } });
    expect(seen)
      .toEqual([matched]);
  });
});
