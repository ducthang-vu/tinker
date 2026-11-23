import { expect, test } from "vitest";
import { componentOf } from "./route.ts";

class Page {}

test("componentOf gives the component a route shows", () => {
  expect(componentOf({ path: "/", component: Page }))
    .toBe(Page);
});

test("componentOf throws for a route with no component, naming it", () => {
  expect(() => componentOf({ path: "/todos" }))
    .toThrow("The route \"/todos\" needs a component");
});
