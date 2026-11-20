import { expect, test } from "vitest";
import { Component } from "@tinker/core";
import { TestBed } from "@tinker/testing";
import { provideRootOutlet, provideRouter } from "./provide-router.ts";
import { RouterOutlet } from "./router-outlet.ts";
import { Router } from "./router.ts";

@Component({ selector: "tk-child", template: "<p>Child</p>" })
class Child {}

@Component({
  selector: "tk-parent",
  template: "<p>Parent</p><router-outlet></router-outlet>",
  imports: [RouterOutlet],
})
class Parent {}

@Component({ selector: "tk-plain", template: "<router-outlet></router-outlet>", imports: [RouterOutlet] })
class Plain {}

@Component({
  selector: "tk-app",
  template: "<router-outlet></router-outlet>",
  imports: [RouterOutlet],
  providers: [provideRootOutlet()],
})
class App {}

@Component({
  selector: "tk-lost",
  template: "<tk-plain></tk-plain>",
  imports: [Plain],
  providers: [provideRootOutlet()],
})
class Lost {}

const ROOT = {
  path: "",
  component: App,
  children: [
    {
      path: "/parent",
      component: Parent,
      children: [{ path: "child", component: Child }],
    },
  ],
};

test("a routed component with an outlet shows the next level inside it", () => {
  window.history.replaceState(null, "", "/parent/child");
  const fixture = TestBed.providers(...provideRouter(ROOT))
    .component(App)
    .build();
  expect(fixture.root.text())
    .toBe("ParentChild");
  fixture.get(Router)
    .navigate("/parent/child?tab=done");
  fixture.detectChanges();
  expect(fixture.root.text())
    .toBe("ParentChild");
  fixture.destroy();
  window.history.replaceState(null, "", "/");
});

test("an outlet in a component its owner does not provide for fails loudly", () => {
  window.history.replaceState(null, "", "/parent/child");
  const lostRoot = {
    path: "",
    component: Lost,
    children: [{ path: "/parent", component: Parent, children: [{ path: "child", component: Child }] }],
  };
  expect(() => TestBed.providers(...provideRouter(lostRoot))
    .component(Lost)
    .build())
    .toThrow(/No provider for ChildActivatedRoute/);
  window.history.replaceState(null, "", "/");
});
