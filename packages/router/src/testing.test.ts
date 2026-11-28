import { expect, test } from "vitest";
import { Component } from "@tinker/core";
import { TestBed } from "@tinker/testing";
import { getOrThrow, isNone } from "@tinker/functional";
import { AppPathBuilder } from "./lib/destination/app-path-builder.ts";
import { RouterOutlet } from "./lib/directives/router-outlet.ts";
import { nested, provideTestRoutes, RouterTestingHarness, type MemoryLocation } from "./testing.ts";
import { PLATFORM_LOCATION } from "./lib/location/platform-location.ts";

@Component({ selector: "tk-list", template: "<p>Todos</p>" })
class TodoList {}

@Component({ selector: "tk-detail", template: "<p>Todo</p>" })
class TodoDetail {}

@Component({ selector: "tk-app", template: "<router-outlet></router-outlet>", imports: [RouterOutlet] })
class App {}

const ROUTES = [
  nested({ path: "todos" }, [
    { path: "", component: TodoList },
    { path: ":id", component: TodoDetail },
  ]),
];

/** A fixture of the app, starting at `url`, and a harness over it. */
function appAt(url: string) {
  const fixture = TestBed.providers(...provideTestRoutes(ROUTES, { url }))
    .component(App)
    .build();
  return { fixture, harness: new RouterTestingHarness(fixture) };
}

test("the harness reads the start URL and the component the outlet shows", () => {
  const { fixture, harness } = appAt("/todos/7");
  expect(harness.currentAppPath.format())
    .toBe("/todos/7");
  expect(getOrThrow(harness.currentRoutedComponent, () => new Error("no page"))
    .text())
    .toBe("Todo");
  fixture.destroy();
});

test("navigate moves to the destination, and the page follows", async () => {
  const { fixture, harness } = appAt("/todos/7");
  const path = fixture.get(AppPathBuilder)
    .parse("/todos")
    .build();
  await harness.navigate(path);
  expect(harness.currentAppPath.format())
    .toBe("/todos");
  expect(getOrThrow(harness.currentRoutedComponent, () => new Error("no page"))
    .text())
    .toBe("Todos");
  fixture.destroy();
});

test("a URL no route takes has no routed component", () => {
  const { fixture, harness } = appAt("/nowhere");
  expect(isNone(harness.currentRoutedComponent))
    .toBe(true);
  fixture.destroy();
});

test("a navigation writes the in-memory location", async () => {
  const { fixture, harness } = appAt("/todos/7");
  await harness.navigate(fixture.get(AppPathBuilder)
    .parse("/todos")
    .build());
  expect(fixture.get(PLATFORM_LOCATION)
    .url())
    .toBe("/todos");
  fixture.destroy();
});

test("a back move from the location is followed by the router", async () => {
  const { fixture, harness } = appAt("/todos/7");
  (fixture.get(PLATFORM_LOCATION) as MemoryLocation).moveTo("/todos");
  await fixture.whenStable();
  expect(harness.currentAppPath.format())
    .toBe("/todos");
  fixture.destroy();
});

test("without a URL the router starts at the root", () => {
  const fixture = TestBed.providers(...provideTestRoutes(ROUTES))
    .component(App)
    .build();
  expect(new RouterTestingHarness(fixture).currentAppPath.format())
    .toBe("/");
  fixture.destroy();
});

test("back and forward move through the history the navigations made", async () => {
  const { fixture, harness } = appAt("/todos");
  await harness.navigate(fixture.get(AppPathBuilder)
    .parse("/todos/7")
    .build());
  await harness.back();
  expect(harness.currentAppPath.format())
    .toBe("/todos");
  expect(getOrThrow(harness.currentRoutedComponent, () => new Error("no page"))
    .text())
    .toBe("Todos");
  await harness.forward();
  expect(harness.currentAppPath.format())
    .toBe("/todos/7");
  expect(getOrThrow(harness.currentRoutedComponent, () => new Error("no page"))
    .text())
    .toBe("Todo");
  fixture.destroy();
});

test("back at the first entry, and forward at the last, do nothing", async () => {
  const { fixture, harness } = appAt("/todos");
  await harness.back();
  expect(harness.currentAppPath.format())
    .toBe("/todos");
  await harness.forward();
  expect(harness.currentAppPath.format())
    .toBe("/todos");
  fixture.destroy();
});
