import { describe, expect, test, vi } from "vitest";
import { inject, Injector, runInInjectionContext } from "../../di/index.ts";
import { signal, watch } from "../../signals/index.ts";
import { ChangeDetection, ChangeDetectionLoopError } from "./change-detection.ts";
import { EffectScheduler } from "./schedulers/effect-scheduler.ts";
import { Ticker } from "./ticker.ts";
import { ViewScheduler } from "./schedulers/view-scheduler.ts";

/** Change detection, a log, and helpers queuing named work in each phase. */
function setup() {
  const { injector } = Injector.create({ providers: [Ticker, EffectScheduler, ViewScheduler, ChangeDetection] });
  const changeDetection = runInInjectionContext(injector, () => inject(ChangeDetection));
  const log: string[] = [];
  const queue = (phase: "effects" | "views") => (label: string, work: () => void = () => {}) =>
    changeDetection[phase].schedule({
      run() {
        log.push(`${phase}:${label}`);
        work();
      },
    });
  return { changeDetection, log, effect: queue("effects"), view: queue("views") };
}

describe("ChangeDetection", () => {
  test("drains one scheduler per phase, injected", () => {
    const { changeDetection } = setup();
    expect(changeDetection.effects).toBeInstanceOf(EffectScheduler);
    expect(changeDetection.views).toBeInstanceOf(ViewScheduler);
  });

  test("a tick runs the effects first, then the views", () => {
    const { changeDetection, log, effect, view } = setup();
    view("render");
    effect("effect");
    changeDetection.tick();
    expect(log).toEqual(["effects:effect", "views:render"]);
  });

  test("repeats rounds until no phase has work, effects first each round", () => {
    const { changeDetection, log, effect, view } = setup();
    effect("1", () => view("1"));
    view("0", () => effect("2", () => view("2")));
    changeDetection.tick();
    expect(log).toEqual(["effects:1", "views:0", "views:1", "effects:2", "views:2"]);
    expect(changeDetection.effects.pending + changeDetection.views.pending).toBe(0);
  });

  test("runs a tick by itself in a microtask, once for many requests", async () => {
    const { log, view } = setup();
    view("a");
    view("b");
    expect(log).toEqual([]);
    await Promise.resolve();
    expect(log).toEqual(["views:a", "views:b"]);
    view("c"); // after the tick, a new request
    await Promise.resolve();
    expect(log).toEqual(["views:a", "views:b", "views:c"]);
  });

  test("work queued during a tick runs in it, without an extra empty tick", async () => {
    const { changeDetection, log, effect, view } = setup();
    const tick = vi.spyOn(changeDetection, "tick");
    view("a", () => effect("b"));
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["views:a", "effects:b"]);
    expect(tick).toHaveBeenCalledOnce();
  });

  test("every task runs even if some throw; the first error is re-thrown after the tick", () => {
    const { changeDetection, log, effect, view } = setup();
    effect("fails", () => {
      throw new Error("first");
    });
    view("renders", () => view("again"));
    expect(() => changeDetection.tick()).toThrow("first");
    expect(log).toEqual(["effects:fails", "views:renders", "views:again"]);
  });

  test("stops an endless loop, drops the queued work, and can tick again", () => {
    const { changeDetection, effect, view } = setup();
    const loop = () => view("loop", () => effect("loop", loop));
    loop();
    expect(() => changeDetection.tick()).toThrow(ChangeDetectionLoopError);
    expect(changeDetection.effects.pending + changeDetection.views.pending).toBe(0);
    expect(() => changeDetection.tick()).not.toThrow();
  });

  test("the loop error explains itself", () => {
    expect(new ChangeDetectionLoopError(100).message).toBe(
      "Change detection did not settle after 100 rounds: an update probably writes a signal " +
        "that something updated in the same tick reads",
    );
  });

  test("with real watches: an effect's write is rendered in the same tick", () => {
    const { changeDetection } = setup();
    const source = signal(1);
    const derived = signal(0);
    const log: string[] = [];
    watch(() => log.push(`view ${derived()}`), changeDetection.views);
    watch(() => derived.set(source() * 10), changeDetection.effects);
    changeDetection.tick();
    source.set(2);
    changeDetection.tick();
    expect(log).toEqual(["view 10", "view 20"]);
  });
});
