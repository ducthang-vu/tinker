import { describe, expect, test } from "vitest";
import { Injector, InjectionToken, inject, provide } from "@tinker/core";
import { type Either, match } from "@tinker/functional";
import type { Route } from "../router/route.ts";
import type { MatchedRequest } from "./request.ts";
import { createRedirectStep } from "./redirect-step.ts";
import { Redirect, type Stop } from "./stop.ts";
import { type AppPath, type Segment, makeAppPath } from "../destination/app-path.ts";
import { builderOver } from "../destination/test-builder.ts";

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

/** The stop of an outcome, or `undefined` when the navigation went on. */
function stopOf(outcome: Either<MatchedRequest, Stop>): Stop | undefined {
  return match<MatchedRequest, Stop, Stop | undefined>(outcome, {
    Left: (stop) => stop,
    Right: () => undefined,
  });
}

/** A matched request for `url`, over the levels of `routes` (root first). */
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

const page = { path: "/todos", component: class {} };

describe("the redirect step", () => {
  test("a route that returns a URL stops the navigation with a Redirect to it", () => {
    const step = createRedirectStep(Injector.create().injector);
    const routes = [{ path: page.path, redirect: () => to("login") }];
    const outcome = step(matchedAt("/todos", routes));
    expect(stopOf(outcome))
      .toBeInstanceOf(Redirect);
  });

  test("routes that return undefined let the navigation go on", () => {
    const step = createRedirectStep(Injector.create().injector);
    const routes = [{ path: page.path, redirect: () => undefined }];
    expect(stopOf(step(matchedAt("/todos", routes))))
      .toBeUndefined();
  });

  test("the routes are asked root first, and the first redirect decides", () => {
    const asked: string[] = [];
    const step = createRedirectStep(Injector.create().injector);
    const root = {
      path: "",
      component: class {},
      redirect: () => {
        asked.push("root");
        return to("home");
      },
    };
    const child = {
      path: page.path,
      redirect: () => {
        asked.push("child");
        return to("elsewhere");
      },
    };
    const matched = matchedAt("/todos", [root, child]);
    const outcome = step(matched);
    expect(asked)
      .toEqual(["root"]);
    expect(stopOf(outcome))
      .toEqual(Redirect.of(matched, to("home")));
  });

  test("a redirect runs in the injection context of the router", () => {
    const TARGET = new InjectionToken<AppPath>("target");
    const { injector } = Injector.create({
      providers: [provide(TARGET, { useValue: to("login") })],
    });
    const step = createRedirectStep(injector);
    const routes = [{ path: page.path, redirect: () => inject(TARGET) }];
    const outcome = step(matchedAt("/todos", routes));
    expect(stopOf(outcome))
      .toEqual(Redirect.of(matchedAt("/todos", routes), to("login")));
  });

  test("a redirect that throws stops the navigation with a Failed", () => {
    const step = createRedirectStep(Injector.create().injector);
    const routes = [{ path: page.path, redirect: () => {
      throw new Error("no config");
    } }];
    const outcome = step(matchedAt("/todos", routes));
    expect(stopOf(outcome))
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });
});
