import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../../index.ts";
import { valueOrThrow } from "@tinker/functional";

describe("template operators", () => {
  test("[class]=\"{ name: value }\" sets the classes whose values are truthy", async () => {
    @Component({
      selector: "tk-class-object",
      template: "<p [class]=\"{ done: todo().done, late: todo().late }\">x</p>",
    })
    class ClassObject {
      readonly todo = signal({ done: true, late: false });
    }
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = valueOrThrow(engine.bootstrap(ClassObject, el));
    engine.flush();
    const p = () => el.querySelector("p")!;
    expect(p().className)
      .toBe("done");
    app.instance.todo.set({ done: false, late: true });
    await tick();
    expect(p().className)
      .toBe("late");
    app.destroy();
  });

  test("(keydown.enter) runs only for Enter, and (keydown.esc) for Escape", async () => {
    const pressed: string[] = [];
    @Component({
      selector: "tk-keys",
      template: "<input (keydown.enter)=\"enter()\" (keydown.esc)=\"esc()\">",
    })
    class Keys {
      enter() {
        pressed.push("enter");
      }

      esc() {
        pressed.push("esc");
      }
    }
    const el = document.createElement("section");
    const app = bootstrap(Keys, { host: el });
    await tick();
    const input = el.querySelector("input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(pressed)
      .toEqual(["enter", "esc"]);
    app.destroy();
  });

  test("a key modifier combines with the others, and a space is ' '", async () => {
    let count = 0;
    @Component({
      selector: "tk-space",
      template: "<input (keydown.space.prevent)=\"tick()\">",
    })
    class Space {
      tick() {
        count++;
      }
    }
    const el = document.createElement("section");
    const app = bootstrap(Space, { host: el });
    await tick();
    const input = el.querySelector("input")!;
    const pressedSpace = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    input.dispatchEvent(pressedSpace);
    expect([count, pressedSpace.defaultPrevented])
      .toEqual([1, true]);
    app.destroy();
  });

  test("safe navigation and defaults in text and attributes", async () => {
    @Component({
      selector: "tk-safe",
      template: "<p [attr.title]=\"user()?.name ?? 'guest'\">{{ user()?.name ?? 'nobody' }}</p>",
    })
    class Safe {
      readonly user = signal<{ name: string } | null>(null);
    }
    const el = document.createElement("section");
    const app = bootstrap(Safe, { host: el });
    await tick();
    const p = () => el.querySelector("p")!;
    expect([p().textContent, p()
      .getAttribute("title")])
      .toEqual(["nobody", "guest"]);
    app.root.instance.user.set({ name: "Ana" });
    await tick();
    expect([p().textContent, p()
      .getAttribute("title")])
      .toEqual(["Ana", "Ana"]);
    app.destroy();
  });
});
