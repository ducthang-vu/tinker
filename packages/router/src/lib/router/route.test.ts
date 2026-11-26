import { expect, test } from "vitest";
import type { MatchedRequest } from "../pipeline/request.ts";
import { componentOf, type Route } from "./route.ts";
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

const target = builderOver([{ path: "/todos", children: [{ path: "/:id", component: class {} }] }] as const)
  .to("todos")
  .to("1")
  .build();

class Page {}

test("componentOf gives the component a route shows", () => {
  expect(componentOf({ path: "/", component: Page }))
    .toBe(Page);
});

test("componentOf throws for a route with no component, naming it", () => {
  expect(() => componentOf({ path: "/todos", children: [] }))
    .toThrow("The route \"/todos\" has no component");
});

test("a route's redirect returns the URL to go to, or undefined to leave the navigation alone", () => {
  const route: Route = {
    path: "/todos",
    redirect: (request) => (request.destination.format() === "/todos" ? target : undefined),
  };
  const matched: MatchedRequest = {
    id: 1,
    destination: destinationOf("/todos"),
    state: null,
    arrival: "push",
    redirectFrom: [], activatedRoutes: [], trace: [],
    chain: [],
  };
  expect(route.redirect?.(matched))
    .toBe(target);
  expect(route.redirect?.({ ...matched, destination: destinationOf("/todos/2") }))
    .toBeUndefined();
});
