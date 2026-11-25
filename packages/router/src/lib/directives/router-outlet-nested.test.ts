import { expect, test } from "vitest";
import { Component } from "@tinker/core";
import { TestBed } from "@tinker/testing";
import { provideRouter } from "../router/provide-router.ts";
import { RouterOutlet } from "./router-outlet.ts";
import { Router } from "../router/router.ts";
import { AppPathBuilder } from "../destination/app-path-builder.ts";

@Component({ selector: "tk-child", template: "<p>Child</p>" })
class Child {}

@Component({
  selector: "tk-parent",
  template: "<p>Parent</p><router-outlet></router-outlet>",
  imports: [RouterOutlet],
})
class Parent {}

@Component({ selector: "tk-app", template: "<router-outlet></router-outlet>", imports: [RouterOutlet] })
class App {}

const ROUTES = [
  {
    path: "/parent",
    component: Parent,
    children: [{ path: "child", component: Child }],
  },
];

test("a routed component with an outlet shows the next level inside it", () => {
  window.history.replaceState(null, "", "/parent/child");
  const fixture = TestBed.providers(...provideRouter(ROUTES))
    .component(App)
    .build();
  expect(fixture.root.text())
    .toBe("ParentChild");
  fixture.get(Router)
    .navigate(fixture.get(AppPathBuilder)
      .parse("/parent/child?tab=done")
      .build());
  fixture.detectChanges();
  expect(fixture.root.text())
    .toBe("ParentChild");
  fixture.destroy();
  window.history.replaceState(null, "", "/");
});
