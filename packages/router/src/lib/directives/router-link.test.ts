import { expect, test } from "vitest";
import { Component } from "@tinker/core";
import { TestBed } from "@tinker/testing";
import { provideRouter } from "../router/provide-router.ts";
import { RouterLink } from "./router-link.ts";
import { RouterOutlet } from "./router-outlet.ts";
import { Router } from "../router/router.ts";
import { AppPathBuilder } from "../destination/app-path-builder.ts";
import { browserPlatformLocation, PLATFORM_LOCATION } from "../location/platform-location.ts";
import { provide } from "@tinker/core";

@Component({
  selector: "tk-todo-list",
  template: [
    "<a class=\"open\" routerlink=\"7\">open</a>",
    "<a class=\"nothing\" [routerlink]=\"nowhere\">none</a>",
    "<a class=\"plain\">plain</a>",
    "<a class=\"blank\" routerlink=\"7\" target=\"_blank\">new tab</a>",
    "<a class=\"self\" routerlink=\"7\" target=\"_self\">self</a>",
    "<a class=\"href\" routerlink=\"7\">href</a>",
    "<a class=\"query\" routerlink=\"7\" [queryParams]=\"tab\">query</a>",
    "<a class=\"fragment\" routerlink=\"7\" fragment=\"top\">fragment</a>",
    "<a class=\"stateful\" routerlink=\"7\" [state]=\"stash\">state</a>",
    "<a class=\"segments\" [routerlink]=\"segments\">segments</a>",
    "<a class=\"set\" routerlink=\"7?x=1\" [queryParams]=\"tab\">set</a>",
    "<a class=\"merge\" routerlink=\"7?x=1\" [queryParams]=\"tab\" [preserveQueryParams]=\"'all'\">merge</a>",
    "<a class=\"override\" routerlink=\"7?tab=open\" [queryParams]=\"tab\" [preserveQueryParams]=\"'all'\">override</a>",
    "<a class=\"listed\" routerlink=\"7?x=1&sort=due\" [queryParams]=\"tab\" [preserveQueryParams]=\"keep\">listed</a>",
    "<a class=\"hashed\" routerlink=\"7#top\">hashed</a>",
  ].join(""),
  imports: [RouterLink],
})
class TodoList {
  readonly nowhere = undefined;
  readonly tab = { tab: "done" };
  readonly stash = { scroll: 320 };
  readonly segments = ["7"];
  readonly keep = ["sort"];
}

@Component({ selector: "tk-root", template: "<p>Root</p>" })
class Root {}

@Component({
  selector: "tk-app",
  template: "<a class=\"root\" routerlink=\"/todos\">root</a><router-outlet></router-outlet>",
  imports: [RouterLink, RouterOutlet],
})
class App {}

@Component({ selector: "tk-todos", template: "<router-outlet></router-outlet>", imports: [RouterOutlet] })
class TodosShell {}

const ROUTES = [
  {
    path: "/todos",
    component: TodosShell,
    children: [
      { path: "", component: TodoList },
      { path: ":id", component: Root },
    ],
  },
];

/** Clicks the anchor with the mouse init given; tells whether the default was stopped. */
function clickLink(
  fixture: ReturnType<typeof appAt>,
  anchor = "a.open",
  init: MouseEventInit = {},
): boolean {
  const element = fixture.root.query(anchor).element;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

/** An app with the router over ROOT, starting at `url`. */
function appAt(url: string) {
  window.history.replaceState(null, "", url);
  return TestBed.providers(...provideRouter(ROUTES))
    .component(App)
    .build();
}

test("a click navigates to the relative destination, and stops the browser's default", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture))
    .toBe(true);
  expect(fixture.get(Router)
    .url())
    .toBe("/todos/7");
  fixture.destroy();
});

test("a link whose destination is undefined stops the default and navigates nowhere", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture, "a.nothing"))
    .toBe(true);
  expect(fixture.get(Router)
    .url())
    .toBe("/todos");
  fixture.destroy();
});

test("an anchor without routerlink is not handled, so the browser's default stands", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture, "a.plain"))
    .toBe(false);
  expect(fixture.get(Router)
    .url())
    .toBe("/todos");
  fixture.destroy();
});

test("a link that targets another tab is left to the browser, and keeps its target attribute", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture, "a.blank"))
    .toBe(false);
  expect(fixture.root.query("a.blank")
    .getAttribute("target"))
    .toBe("_blank");
  expect(fixture.get(Router)
    .url())
    .toBe("/todos");
  fixture.destroy();
});

test("a link that targets this tab is handled", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture, "a.self"))
    .toBe(true);
  expect(fixture.get(Router)
    .url())
    .toBe("/todos/7");
  fixture.destroy();
});

test("a modifier or middle click is left to the browser", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture, "a.open", { ctrlKey: true }))
    .toBe(false);
  expect(clickLink(fixture, "a.open", { metaKey: true }))
    .toBe(false);
  expect(clickLink(fixture, "a.open", { shiftKey: true }))
    .toBe(false);
  expect(clickLink(fixture, "a.open", { altKey: true }))
    .toBe(false);
  expect(clickLink(fixture, "a.open", { button: 1 }))
    .toBe(false);
  expect(fixture.get(Router)
    .url())
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

test("a link in the root component navigates from the root", () => {
  const fixture = appAt("/nowhere");
  window.history.replaceState(null, "", "/todos");
  expect(clickLink(fixture, "a.root"))
    .toBe(true);
  expect(fixture.get(Router)
    .url())
    .toBe("/todos");
  fixture.destroy();
});

test("queryParams are added to the destination, in the href and in the navigation", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.query("a.query")
    .getAttribute("href"))
    .toBe("/todos/7?tab=done");
  expect(clickLink(fixture, "a.query"))
    .toBe(true);
  expect(fixture.get(Router)
    .url())
    .toBe("/todos/7?tab=done");
  fixture.destroy();
});

test("a fragment is the hash of the destination", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture, "a.fragment"))
    .toBe(true);
  expect(fixture.get(Router)
    .url())
    .toBe("/todos/7#top");
  fixture.destroy();
});

test("state is the state of the history entry a click creates", () => {
  const fixture = appAt("/todos");
  expect(clickLink(fixture, "a.stateful"))
    .toBe(true);
  expect(window.history.state)
    .toEqual({ scroll: 320 });
  fixture.destroy();
});

test("aria-current is page on the link to the current path, and absent elsewhere", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.query("a.root")
    .getAttribute("aria-current"))
    .toBe("page");
  expect(fixture.root.query("a.open")
    .getAttribute("aria-current"))
    .toBeNull();
  fixture.get(Router)
    .navigate(fixture.get(AppPathBuilder)
      .parse("/todos/7")
      .build());
  fixture.detectChanges();
  expect(fixture.root.query("a.root")
    .getAttribute("aria-current"))
    .toBeNull();
  fixture.destroy();
});

test("a destination given as segments is joined, and resolved against the route", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.query("a.segments")
    .getAttribute("href"))
    .toBe("/todos/7");
  fixture.destroy();
});

test("the href attribute is in the platform's form, when the platform has one", () => {
  window.history.replaceState(null, "", "/todos");
  const platform = { ...browserPlatformLocation, href: (path: string) => `/base${path}` };
  // The first provider of a token wins, so the platform comes before provideRouter's.
  const fixture = TestBed
    .providers(provide(PLATFORM_LOCATION, { useValue: platform }), ...provideRouter(ROUTES))
    .component(App)
    .build();
  expect(fixture.root.query("a.root").element.getAttribute("href"))
    .toBe("/base/todos");
  fixture.destroy();
});

test("without an href on the platform, the href attribute is the app's path", () => {
  window.history.replaceState(null, "", "/todos");
  const platform = { ...browserPlatformLocation, href: undefined };
  const fixture = TestBed
    .providers(provide(PLATFORM_LOCATION, { useValue: platform }), ...provideRouter(ROUTES))
    .component(App)
    .build();
  expect(fixture.root.query("a.root").element.getAttribute("href"))
    .toBe("/todos");
  fixture.destroy();
});

test("preserveQueryParams: none drops the URL's query, all keeps it, a list keeps only its keys, and queryParams override shared keys", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.query("a.set")
    .getAttribute("href"))
    .toBe("/todos/7?tab=done");
  expect(fixture.root.query("a.merge")
    .getAttribute("href"))
    .toBe("/todos/7?x=1&tab=done");
  expect(fixture.root.query("a.override")
    .getAttribute("href"))
    .toBe("/todos/7?tab=done");
  expect(fixture.root.query("a.listed")
    .getAttribute("href"))
    .toBe("/todos/7?sort=due&tab=done");
  fixture.destroy();
});

test("a fragment in the link's URL is kept, when the link sets none", () => {
  const fixture = appAt("/todos");
  expect(fixture.root.query("a.hashed")
    .getAttribute("href"))
    .toBe("/todos/7#top");
  fixture.destroy();
});
