import { expect, test } from "vitest";
import { Component, getDirectiveMetadata, inject } from "@tinker/core";
import { TestBed } from "@tinker/testing";
import { provideRouter } from "./provide-router.ts";
import { RouterOutlet } from "./router-outlet.ts";
import { Router } from "./router.ts";

/** How many instances of each routed component were made, to tell a replacement from a keep. */
const made = { list: 0, detail: 0 };

@Component({ selector: "tk-todo-list", template: "<p>Todos</p>" })
class TodoList {
  constructor() {
    made.list++;
  }
}

@Component({ selector: "tk-todo-detail", template: "<p>Todo</p>" })
class TodoDetail {
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

const ROOT = {
  path: "",
  component: Root,
  children: [
    { path: "/todos", component: TodoList },
    { path: "/todos/:id", component: TodoDetail },
  ],
};

/** An app with the router over ROOT, starting at `url`. */
function appAt(url: string) {
  window.history.replaceState(null, "", url);
  made.list = 0;
  made.detail = 0;
  return TestBed.providers(...provideRouter(ROOT))
    .component(App)
    .build();
}

test("RouterOutlet is a directive for the router-outlet element", () => {
  const metadata = getDirectiveMetadata(RouterOutlet)
    .getOrThrow(() => new Error("not a directive"));
  expect(metadata.selector)
    .toBe("router-outlet");
});

test("the outlet shows the component of the URL it starts at", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.text())
    .toBe("Todos");
  fixture.destroy();
});

test("navigating to another route shows its component", () => {
  const fixture = appAt("/todos");
  fixture.root.instance.router.navigate("/todos/7");
  fixture.detectChanges();
  expect(fixture.root.text())
    .toBe("Todo");
  fixture.destroy();
});

test("a change of params replaces the component", () => {
  const fixture = appAt("/todos/7");
  fixture.root.instance.router.navigate("/todos/8");
  fixture.detectChanges();
  expect(made.detail)
    .toBe(2);
  fixture.destroy();
});

test("a change of the query alone keeps the component", () => {
  const fixture = appAt("/todos/7");
  fixture.root.instance.router.navigate("/todos/7?tab=done");
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
