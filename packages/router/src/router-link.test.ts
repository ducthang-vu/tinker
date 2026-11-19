import { expect, test } from "vitest";
import { Component, inject } from "@tinker/core";
import { TestBed } from "@tinker/testing";
import { provideRouter } from "./provide-router.ts";
import { RouterLink } from "./router-link.ts";
import { RouterOutlet } from "./router-outlet.ts";
import { Router } from "./router.ts";

@Component({
  selector: "tk-todo-list",
  template: "<a routerlink=\"7\">open</a><a class=\"nothing\" [routerlink]=\"nowhere\">none</a><a class=\"plain\">plain</a>",
  imports: [RouterLink],
})
class TodoList {
  readonly nowhere = undefined;
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
    { path: "/todos/:id", component: Root },
  ],
};

/** Clicks the first anchor of the app, and tells whether the click's default was stopped. */
function clickFirstLink(fixture: ReturnType<typeof appAt>, anchor = "a"): boolean {
  const element = fixture.root.query(anchor).element;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

/** An app with the router over ROOT, starting at `/todos`. */
function appAt(url: string) {
  window.history.replaceState(null, "", url);
  return TestBed.providers(...provideRouter(ROOT))
    .component(App)
    .build();
}

test("a click navigates to the relative destination, and stops the browser's default", () => {
  const fixture = appAt("/todos");
  const prevented = clickFirstLink(fixture);
  expect(prevented)
    .toBe(true);
  expect(fixture.root.instance.router.url())
    .toBe("/todos/7");
  fixture.destroy();
});

test("a link whose destination is undefined stops the default and navigates nowhere", () => {
  const fixture = appAt("/todos");
  const prevented = clickFirstLink(fixture, "a.nothing");
  expect(prevented)
    .toBe(true);
  expect(fixture.root.instance.router.url())
    .toBe("/todos");
  fixture.destroy();
});

test("an anchor without routerlink is not handled, so the browser's default stands", () => {
  const fixture = appAt("/todos");
  const prevented = clickFirstLink(fixture, "a.plain");
  expect(prevented)
    .toBe(false);
  expect(fixture.root.instance.router.url())
    .toBe("/todos");
  fixture.destroy();
});
