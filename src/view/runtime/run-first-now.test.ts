import { describe, expect, test } from "vitest";
import { signal, watch } from "../../signals/index.ts";
import { RunFirstNow } from "./run-first-now.ts";
import { inject, Injector, runInInjectionContext } from "../../di/index.ts";
import { Ticker } from "./ticker.ts";
import { ViewScheduler } from "./schedulers/view-scheduler.ts";

/** A ViewScheduler from an injector (its ticks are requested, never run here: flush by hand). */
function views(): ViewScheduler {
  const { injector } = Injector.create({ providers: [Ticker, ViewScheduler] });
  return runInInjectionContext(injector, () => inject(ViewScheduler));
}

describe("RunFirstNow", () => {
  test("runs the first request now, and passes later ones to the next scheduler", () => {
    const next = views();
    const count = signal(1);
    const seen: number[] = [];

    watch(() => void seen.push(count()), new RunFirstNow(next));
    expect(seen).toEqual([1]);
    expect(next.pending).toBe(0);

    count.set(2);
    expect(seen).toEqual([1]);
    expect(next.pending).toBe(1);
    next.flush();
    expect(seen).toEqual([1, 2]);
  });

  test("keeps the first run's error instead of throwing it", () => {
    const firstRun = new RunFirstNow(views());
    expect(firstRun.failure.isNone()).toBe(true);

    const error = new Error("first render failed");
    const handle = watch(() => {
      throw error;
    }, firstRun);

    expect(firstRun.failure.getOrElse(undefined)).toBe(error);
    handle.destroy();
  });

  test("a successful first run has no failure", () => {
    const firstRun = new RunFirstNow(views());
    watch(() => {}, firstRun);
    expect(firstRun.failure.isNone()).toBe(true);
  });

  test("later errors are not kept: they surface through the next scheduler", () => {
    const next = views();
    const firstRun = new RunFirstNow(next);
    const fail = signal(false);
    watch(() => {
      if (fail()) {
        throw new Error("later");
      }
    }, firstRun);

    fail.set(true);
    expect(() => next.flush()).toThrow("later");
    expect(firstRun.failure.isNone()).toBe(true);
  });
});
