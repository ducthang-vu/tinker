import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { Ticker } from "./ticker.ts";

describe("Ticker", () => {
  test("runs the registered tick once a frame or a timer has passed, once for many requests", async () => {
    const ticker = new Ticker();
    let ticks = 0;
    ticker.onTick(() => ticks++);
    ticker.requestTick();
    ticker.requestTick();
    expect(ticks)
      .toBe(0);
    await tick();
    expect(ticks)
      .toBe(1);
  });

  test("a write made after a microtask in the same task is covered by the same tick", async () => {
    const ticker = new Ticker();
    let ticks = 0;
    ticker.onTick(() => ticks++);
    ticker.requestTick();
    await Promise.resolve();
    ticker.requestTick();
    await tick();
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
    await tick();
    expect(ticks)
      .toBe(1);
    ticker.requestTick();
    await tick();
    expect(ticks)
      .toBe(2);
  });

  test("without a registered tick, a request does nothing", async () => {
    const ticker = new Ticker();
    ticker.requestTick();
    await tick();
    ticker.onTick(() => {});
    expect(() => ticker.requestTick()).not.toThrow();
  });
});
