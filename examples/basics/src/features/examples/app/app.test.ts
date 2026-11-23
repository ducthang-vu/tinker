import { describe, expect, test } from "vitest";
import { Component } from "@tinker/core";
import { provideRouter } from "@tinker/router";
import { TestBed } from "@tinker/testing";
import { App } from "./app.ts";
import { nth } from "../../../../testing/testing-helpers.ts";

// Stub pages, so the shell is tested without the demos or the reference.
@Component({ selector: "tk-stub-home", template: "<h1>Home stub</h1>" })
class HomeStub {}

@Component({ selector: "tk-stub-api", template: "<h1>API stub</h1>" })
class ApiStub {}

@Component({ selector: "tk-stub-missing", template: "<h1>Missing stub</h1>" })
class MissingStub {}

const ROUTES = {
  path: "",
  component: App,
  children: [
    { path: "/", component: HomeStub },
    { path: "/api", component: ApiStub },
    { path: "**", component: MissingStub },
  ],
};

/** The app, over the stub routes, at `url`. */
function appAt(url: string) {
  window.history.replaceState(null, "", url);
  return TestBed.providers(...provideRouter(ROUTES))
    .component(App)
    .build();
}

/** The link under the root whose text is `label`. Throws if there is none. */
function linkNamed(root: ReturnType<typeof appAt>["root"], label: string): HTMLElement {
  const found = root.queryAll("a")
    .find((link) => link.text() === label);
  if (!found) {
    throw new Error(`No link "${label}"`);
  }
  return found.element as HTMLElement;
}

describe("the app's shell", () => {
  test("shows the page of the URL in the outlet, between the header and the footer", () => {
    const fixture = appAt("/");
    expect(fixture.root.query("main")
      .text())
      .toContain("Home stub");
    expect(fixture.root.query("header")
      .text())
      .toContain("Tinker");
    fixture.destroy();
  });

  test("the link of the page shown is the current one", () => {
    const fixture = appAt("/api");
    expect(linkNamed(fixture.root, "API reference")
      .getAttribute("aria-current"))
      .toBe("page");
    expect(linkNamed(fixture.root, "Examples")
      .getAttribute("aria-current"))
      .toBeNull();
    fixture.destroy();
  });

  test("a header link shows its page, without a reload", () => {
    const fixture = appAt("/");
    linkNamed(fixture.root, "API reference")
      .dispatchEvent(new MouseEvent("click"));
    fixture.detectChanges();
    expect(fixture.root.query("main")
      .text())
      .toContain("API stub");
    expect(window.location.pathname)
      .toBe("/api");
    fixture.destroy();
  });

  test("a URL no route matches shows the catch-all page", () => {
    const fixture = appAt("/nowhere");
    expect(fixture.root.query("main")
      .text())
      .toContain("Missing stub");
    fixture.destroy();
  });

  test("the links are the same in every page", () => {
    const fixture = appAt("/");
    const names = fixture.root.queryAll("nav a")
      .map((link) => link.text());
    expect(names)
      .toEqual(["Examples", "API reference"]);
    expect(nth(names, 0))
      .toBe("Examples");
    fixture.destroy();
  });
});
