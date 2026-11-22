import { expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../../index.ts";
import { valueOrThrow } from "@tinker/functional";

test("a DOM handler gets arguments, including a field of $event", () => {
  const calls: unknown[][] = [];
  @Component({
    selector: "tk-args",
    template: "<button (keydown)=\"pick(id, $event.key, 'x')\">x</button>",
  })
  class Args {
    readonly id = 7;
    pick(...args: unknown[]) {
      calls.push(args);
    }
  }
  const el = document.createElement("section");
  const app = valueOrThrow(bootstrap(Args, { host: el }));
  el.querySelector("button")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(calls)
    .toEqual([[7, "Enter", "x"]]);
  app.destroy();
});
