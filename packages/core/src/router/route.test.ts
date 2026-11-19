import { expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "../di/index.ts";
import { ROUTES, type Route } from "./route.ts";

class TodoList {}
class TodoDetail {}

test("the route table is provided under ROUTES", () => {
  const routes: readonly Route[] = [
    { path: "/todos", component: TodoList },
    { path: "/todos/:id", component: TodoDetail, data: { title: "Todo" } },
  ];
  const { injector } = Injector.create({
    providers: [provide(ROUTES, { useValue: routes })],
  });
  expect(runInInjectionContext(injector, () => inject(ROUTES)))
    .toBe(routes);
});
