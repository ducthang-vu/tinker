import { expect, test } from "vitest";
import type { MatchedRequest } from "../pipeline/request.ts";
import { componentOf, type Route } from "./route.ts";

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
    redirect: (request) => (request.url === "/todos" ? "/todos/1" : undefined),
  };
  const matched: MatchedRequest = {
    id: 1,
    url: "/todos",
    state: null,
    arrival: "push",
    redirectFrom: [],
    chain: [],
  };
  expect(route.redirect?.(matched))
    .toBe("/todos/1");
  expect(route.redirect?.({ ...matched, url: "/todos/2" }))
    .toBeUndefined();
});
