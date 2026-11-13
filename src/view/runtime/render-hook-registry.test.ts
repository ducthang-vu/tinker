import { describe, expect, test } from "vitest";
import { RenderHookRegistry } from "./render-hook-registry.ts";

describe("RenderHookRegistry", () => {
  test("each-render hooks run every time, next-render hooks once, in that order", () => {
    const hooks = new RenderHookRegistry();
    const log: string[] = [];
    hooks.addNextRender(() => log.push("next"));
    hooks.addEachRender(() => log.push("each"));
    expect(hooks.hasHooks)
      .toBe(true);
    hooks.rendered();
    hooks.rendered();
    expect(log)
      .toEqual(["each", "next", "each"]);
  });

  test("cancelling removes a hook; the same function registered twice runs twice", () => {
    const hooks = new RenderHookRegistry();
    const log: string[] = [];
    const push = () => log.push("hook");
    hooks.addEachRender(push);
    const cancel = hooks.addEachRender(push);
    hooks.addNextRender(() => log.push("next")); // cancelled below, before it runs
    const cancelNext = hooks.addNextRender(() => log.push("cancelled"));
    cancelNext();
    cancel();
    cancel();
    hooks.rendered();
    expect(log)
      .toEqual(["hook", "next"]);
  });

  test("a hook registered while hooks run waits for the next render", () => {
    const hooks = new RenderHookRegistry();
    const log: string[] = [];
    hooks.addNextRender(() => hooks.addNextRender(() => log.push("later")));
    hooks.rendered();
    expect(log)
      .toEqual([]);
    hooks.rendered();
    expect(log)
      .toEqual(["later"]);
  });

  test("every hook runs even if one throws; the first error is re-thrown", () => {
    const hooks = new RenderHookRegistry();
    const log: string[] = [];
    hooks.addEachRender(() => {
      throw new Error("first");
    });
    hooks.addNextRender(() => log.push("next"));
    expect(() => hooks.rendered())
      .toThrow("first");
    expect(log)
      .toEqual(["next"]);
  });

  test("has no hooks until one is registered", () => {
    const hooks = new RenderHookRegistry();
    expect(hooks.hasHooks)
      .toBe(false);
    hooks.addNextRender(() => {});
    hooks.rendered();
    expect(hooks.hasHooks)
      .toBe(false);
  });
});
