import { expect, test } from "vitest";
import type { MatchedRequest } from "../pipeline/request.ts";
import { componentOf, type Route } from "./route.ts";
import { UrlBuilder } from "../destination/url-builder.ts";
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

const target = UrlBuilder.for([{ path: "/todos", children: [{ path: "/:id" }] }] as const)
  .withSegment("todos")
  .withParam("id", "1")
  .build();

class Page {}

test("componentOf gives the component a route shows", () => {
  expect(componentOf({ path: "/", component: Page }))
    .toBe(Page);
});

test("componentOf throws for a route with no component, naming it", () => {
  expect(() => componentOf({ path: "/todos" }))
    .toThrow("The route \"/todos\" needs a component");
});

test("a route's redirect returns the URL to go to, or undefined to leave the navigation alone", () => {
  const route: Route = {
    path: "/todos",
    component: class {},
    redirect: (request) => (request.destination.format() === "/todos" ? target : undefined),
  };
  const matched: MatchedRequest = {
    id: 1,
    destination: destinationOf("/todos"),
    state: null,
    arrival: "push",
    redirectFrom: [],
    chain: [],
  };
  expect(route.redirect?.(matched))
    .toBe(target);
  expect(route.redirect?.({ ...matched, destination: destinationOf("/todos/2") }))
    .toBeUndefined();
});
