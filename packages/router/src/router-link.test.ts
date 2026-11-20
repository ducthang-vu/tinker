import { expect, test } from "vitest";
import { Component, inject } from "@tinker/core";
import { TestBed } from "@tinker/testing";
import { provideRouter } from "./provide-router.ts";
import { RouterLink } from "./router-link.ts";
import { RouterOutlet } from "./router-outlet.ts";
import { Router } from "./router.ts";

@Component({
  selector: "tk-todo-list",
  template: "<a routerlink=\"7\">open</a><a class=\"nothing\" [routerlink]=\"nowhere\">none</a><a class=\"plain\">plain</a><a class=\"blank\" routerlink=\"7\" target=\"_blank\">new tab</a><a class=\"self\" routerlink=\"7\" target=\"_self\">self</a><a class=\"href\" routerlink=\"7\">href</a>",
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

/** Clicks the anchor with the mouse init given; tells whether the default was stopped. */
function clickFirstLink(
  fixture: ReturnType<typeof appAt>,
  anchor = "a",
  init: MouseEventInit = {},
): boolean {
  const element = fixture.root.query(anchor).element;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
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

test("a link that targets another tab is left to the browser, and keeps its target attribute", () => {
  const fixture = appAt("/todos");
  expect(clickFirstLink(fixture, "a.blank"))
    .toBe(false);
  expect(fixture.root.query("a.blank")
    .getAttribute("target"))
    .toBe("_blank");
  expect(fixture.root.instance.router.url())
    .toBe("/todos");
  fixture.destroy();
});

test("a link that targets this tab is handled", () => {
  const fixture = appAt("/todos");
  expect(clickFirstLink(fixture, "a.self"))
    .toBe(true);
  expect(fixture.root.instance.router.url())
    .toBe("/todos/7");
  fixture.destroy();
});

test("a modifier or middle click is left to the browser", () => {
  const fixture = appAt("/todos");
  expect(clickFirstLink(fixture, "a.self", { ctrlKey: true }))
    .toBe(false);
  expect(clickFirstLink(fixture, "a.self", { metaKey: true }))
    .toBe(false);
  expect(clickFirstLink(fixture, "a.self", { shiftKey: true }))
    .toBe(false);
  expect(clickFirstLink(fixture, "a.self", { altKey: true }))
    .toBe(false);
  expect(clickFirstLink(fixture, "a.self", { button: 1 }))
    .toBe(false);
  expect(fixture.root.instance.router.url())
    .toBe("/todos");
  fixture.destroy();
});

test("the href is the URL a click navigates to, and an anchor with no destination has none", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.query("a.href")
    .getAttribute("href"))
    .toBe("/todos/7");
  expect(fixture.root.query("a.nothing")
    .getAttribute("href"))
    .toBeNull();
  fixture.destroy();
});
