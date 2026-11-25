import { describe, expect, test } from "vitest";
import { type Either, match } from "@tinker/functional";
import { type AppPath, type Segment, makeAppPath } from "../destination/app-path.ts";
import { builderOver } from "../destination/test-builder.ts";
import type { Route } from "../router/route.ts";
import { createMatchStep, MAX_REDIRECTS } from "./match-step.ts";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import type { Stop } from "./stop.ts";

const declared = [{ path: "/todos", children: [{ path: "/:id" }] }, { path: "/home" }] as const;

const root: Route = {
  path: "",
  component: class {},
  children: [
    { path: "/todos", component: class {}, children: [{ path: "/:id", component: class {} }] },
    { path: "/home", component: class {} },
  ],
};

/** A request for a destination, with no redirects. */
function requestFor(destination: AppPath): NavigationRequest {
  return { id: 1, destination, state: null, arrival: "push", redirectFrom: [], trace: [] };
}

/** The matched request, or the stop, of a match step's outcome. */
function matchedOf(outcome: Either<MatchedRequest, Stop>): MatchedRequest | undefined {
  return match<MatchedRequest, Stop, MatchedRequest | undefined>(outcome, {
    Right: (matched) => matched,
    Left: () => undefined,
  });
}

/** The stop of a match step's outcome, or undefined when it matched. */
function stopOf(outcome: Either<MatchedRequest, Stop>): Stop | undefined {
  return match<MatchedRequest, Stop, Stop | undefined>(outcome, {
    Right: () => undefined,
    Left: (stop) => stop,
  });
}

describe("the match step", () => {
  test("a destination of the tree matches each part to its route, with its param", () => {
    const destination = builderOver(declared)
      .to("todos")
      .to("7")
      .build();
    const matched = matchedOf(createMatchStep(root)(requestFor(destination)));
    expect(matched?.chain.map((level) => level.route.path))
      .toEqual(["", "/todos", "/:id"]);
    expect(matched?.chain.at(-1)?.params)
      .toEqual({ id: "7" });
  });

  test("a destination the tree does not have is a no-route stop", () => {
    const destination = builderOver(declared)
      .to("home")
      .build();
    const empty: Route = { path: "", component: class {}, children: [] };
    expect(stopOf(createMatchStep(empty)(requestFor(destination))))
      .toMatchObject({ kind: "rejected", reason: "no-route" });
  });

  test("a navigation past the redirect cap fails at the match step", () => {
    const destination = builderOver(declared)
      .to("home")
      .build();
    const redirected: NavigationRequest = {
      ...requestFor(destination),
      redirectFrom: Array.from({ length: MAX_REDIRECTS + 1 }, () => destination),
    };
    expect(stopOf(createMatchStep(root)(redirected)))
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });

  test("a part below a route with no children is a no-route stop", () => {
    const below: Segment[] = [
      { kind: "segment", value: "home" },
      { kind: "segment", value: "x" },
    ];
    expect(stopOf(createMatchStep(root)(requestFor(makeAppPath(below, {}, undefined)))))
      .toMatchObject({ kind: "rejected", reason: "no-route" });
  });
});
