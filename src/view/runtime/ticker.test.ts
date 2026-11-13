import { describe, expect, test } from "vitest";
import { Ticker } from "./ticker.ts";

describe("Ticker", () => {
  test("runs the registered tick in a microtask, once for many requests", async () => {
    const ticker = new Ticker();
    let ticks = 0;
    ticker.onTick(() => ticks++);
    ticker.requestTick();
    ticker.requestTick();
    expect(ticks)
      .toBe(0);
    await Promise.resolve();
    expect(ticks)
      .toBe(1);
  });

  test("requests made during a tick are covered by it; later ones get a new tick", async () => {
    const ticker = new Ticker();
    let ticks = 0;
    ticker.onTick(() => {
      ticks++;
      ticker.requestTick(); // during the tick: no new one
    });
    ticker.requestTick();
    await Promise.resolve();
    await Promise.resolve();
    expect(ticks)
      .toBe(1);
    ticker.requestTick();
    await Promise.resolve();
    expect(ticks)
      .toBe(2);
  });

  test("a failing tick still lets the next request schedule a tick", async () => {
    const ticker = new Ticker();
    let ticks = 0;
    ticker.onTick(() => {
      ticks++;
      throw new Error("tick failed");
    });
    const errors: unknown[] = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (task) =>
      original(() => {
        try {
          task();
        } catch (error) {
          errors.push(error);
        }
      });
    try {
      ticker.requestTick();
      await Promise.resolve();
      ticker.requestTick();
      await Promise.resolve();
    } finally {
      globalThis.queueMicrotask = original;
    }
    expect(ticks)
      .toBe(2);
    expect(errors)
      .toHaveLength(2);
  });

  test("without a registered tick, a request does nothing", async () => {
    const ticker = new Ticker();
    ticker.requestTick();
    await Promise.resolve();
    ticker.onTick(() => {});
    expect(() => ticker.requestTick()).not.toThrow();
  });
});
