import { expect, test } from "vitest";
import { Component, inject } from "@tinker/core";
import { getDirectiveMetadata } from "@tinker/core/testing";
import { TestBed } from "@tinker/testing";
import { provideRouter } from "../router/provide-router.ts";
import { RouterOutlet } from "./router-outlet.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import { Router } from "../router/router.ts";
import { getOrThrow } from "@tinker/functional";

/** How many instances of each routed component were made, to tell a replacement from a keep. */
const made = { list: 0, detail: 0 };

@Component({ selector: "tk-todo-list", template: "<p>Todos</p>" })
class TodoList {
  constructor() {
    made.list++;
  }
}

@Component({ selector: "tk-todo-detail", template: "<p>Todo {{ id }}</p>" })
class TodoDetail {
  readonly id = inject(ActivatedRoute).params["id"];
  constructor() {
    made.detail++;
  }
}

@Component({ selector: "tk-root", template: "<p>Root</p>" })
class Root {}

@Component({ selector: "tk-app", template: "<router-outlet></router-outlet>", imports: [RouterOutlet] })
class App {
  readonly router = inject(Router);
}

@Component({ selector: "tk-todos", template: "<router-outlet></router-outlet>", imports: [RouterOutlet] })
class TodosShell {}

const ROUTES = [
  {
    path: "/todos",
    component: TodosShell,
    children: [
      { path: "", component: TodoList },
      { path: ":id", component: TodoDetail },
    ],
  },
];

/** An app with the router over ROOT, starting at `url`. */
function appAt(url: string) {
  window.history.replaceState(null, "", url);
  made.list = 0;
  made.detail = 0;
  return TestBed.providers(...provideRouter(ROUTES))
    .component(App)
    .build();
}

test("RouterOutlet is a directive for the router-outlet element", () => {
  const metadata = getOrThrow(getDirectiveMetadata(RouterOutlet), () => new Error("not a directive"));
  expect(metadata.selector)
    .toBe("router-outlet");
});

test("the outlet shows the component of the URL it starts at", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.text())
    .toBe("Todos");
  fixture.destroy();
});

test("navigating to another route shows its component, which reads its own params", () => {
  const fixture = appAt("/todos");
  fixture.root.instance.router.navigate(fixture.root.instance.router.parse("/todos/7"));
  fixture.detectChanges();
  expect(fixture.root.text())
    .toBe("Todo 7");
  fixture.destroy();
});

test("a change of params replaces the component", () => {
  const fixture = appAt("/todos/7");
  fixture.root.instance.router.navigate(fixture.root.instance.router.parse("/todos/8"));
  fixture.detectChanges();
  expect(made.detail)
    .toBe(2);
  fixture.destroy();
});

test("a change of the query alone keeps the component", () => {
  const fixture = appAt("/todos/7");
  fixture.root.instance.router.navigate(fixture.root.instance.router.parse("/todos/7?tab=done"));
  fixture.detectChanges();
  expect(made.detail)
    .toBe(1);
  fixture.destroy();
});

test("a URL no route matches shows nothing", () => {
  const fixture = appAt("/nowhere");
  expect(fixture.root.text())
    .toBe("");
  fixture.destroy();
});

test("going back to a URL no route matches clears the component", () => {
  const fixture = appAt("/todos");
  window.history.replaceState(null, "", "/nowhere");
  window.dispatchEvent(new PopStateEvent("popstate"));
  fixture.detectChanges();
  expect(fixture.root.text())
    .toBe("");
  fixture.destroy();
});
