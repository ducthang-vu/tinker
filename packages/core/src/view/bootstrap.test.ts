import { describe, expect, test } from "vitest";
import { messageOf, tick } from "./internal/test-support.ts";
import { inject, InjectionToken, provide } from "../di/index.ts";
import { Component } from "./internal/authoring/decorators.ts";
import { bootstrap } from "./bootstrap.ts";

const TITLE = new InjectionToken<string>("TITLE");

@Component({ selector: "tk-app", template: "<p>{{ title }}</p>" })
class App {
  readonly title = inject(TITLE);
}

describe("bootstrap", () => {
  test("renders the root into the given host, and returns an AppRef with the root", async () => {
    const host = document.createElement("section");
    const app = bootstrap(App, {
      host,
      providers: [provide(TITLE, { useValue: "hello" })],
    });
    await tick();
    expect(app.destroy)
      .toBeTypeOf("function");
    expect(app.root.instance)
      .toBeInstanceOf(App);
    expect(host.textContent)
      .toBe("hello");
  });

  test("without a host, renders into the page element that matches the root's selector", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    const app = bootstrap(App, { providers: [provide(TITLE, { useValue: "page" })] });
    await tick();
    expect(document.querySelector("tk-app")!.textContent)
      .toBe("page");
    app.destroy();
    document.body.innerHTML = "";
  });

  test("without a host and no matching element, it fails, naming the selector", () => {
    document.body.innerHTML = "";
    expect(() => bootstrap(App, { providers: [provide(TITLE, { useValue: "x" })] }))
      .toThrow("No host element matches \"tk-app\" for App");
  });

  test("destroy removes the root from its host, and is harmless when repeated", async () => {
    const host = document.createElement("section");
    const app = bootstrap(App, {
      host,
      providers: [provide(TITLE, { useValue: "bye" })],
    });
    app.destroy();
    await tick();
    expect(host.innerHTML)
      .toBe("");
    expect(() => app.destroy())
      .not.toThrow();
  });

  test("each bootstrap is its own app, with its own providers", async () => {
    const first = bootstrap(App, {
      host: document.createElement("div"),
      providers: [provide(TITLE, { useValue: "one" })],
    });
    const second = bootstrap(App, {
      host: document.createElement("div"),
      providers: [provide(TITLE, { useValue: "two" })],
    });
    await tick();
    expect(first.root.host.nativeElement.textContent)
      .toBe("one");
    expect(second.root.host.nativeElement.textContent)
      .toBe("two");
  });
});
