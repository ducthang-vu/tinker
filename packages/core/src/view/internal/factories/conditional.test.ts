import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../../index.ts";

describe("the conditional operator in a template", () => {
  test("in a text and an attribute, nested, and updating with its values", async () => {
    @Component({
      selector: "tk-conditional",
      template: "<p title=\"{{ '' }}\" [attr.title]=\"score() >= 90 ? 'A' : score() >= 60 ? 'B' : 'C'\">{{ on() ? 'on' : 'off' }}</p>",
    })
    class Conditional {
      readonly on = signal(true);
      readonly score = signal(70);
    }
    const el = document.createElement("section");
    const app = bootstrap(Conditional, { host: el });
    await tick();
    const p = () => el.querySelector("p")!;
    expect([p().textContent, p()
      .getAttribute("title")])
      .toEqual(["on", "B"]);
    app.root.instance.on.set(false);
    app.root.instance.score.set(95);
    await tick();
    expect([p().textContent, p()
      .getAttribute("title")])
      .toEqual(["off", "A"]);
    app.destroy();
  });
});
