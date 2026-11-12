import { expect, expectTypeOf, test } from "vitest";
import * as api from "./index.ts";
import type {
  EqualityFn,
  OnCleanup,
  ReadonlySignal,
  Runnable,
  Signal,
  Watch,
  WatchFn,
  WatchScheduler,
} from "./index.ts";

test("exports exactly the public runtime symbols", () => {
  expect(Object.keys(api).sort()).toEqual([
    "SignalCycleError",
    "SignalWriteError",
    "WatchLoopError",
    "computed",
    "signal",
    "untracked",
    "watch",
  ]);
});

test("exports the public types", () => {
  expectTypeOf<Signal<number>>().toExtend<ReadonlySignal<number>>();
  expectTypeOf<ReadonlySignal<number>>().toEqualTypeOf<ReadonlySignal<number>>();
  expectTypeOf<Watch>().toHaveProperty("destroy");
  expectTypeOf<Runnable>().toEqualTypeOf<{ run(): void }>();
  expectTypeOf<WatchScheduler>().toEqualTypeOf<{ schedule(task: Runnable): void }>();
  expectTypeOf<EqualityFn<number>>().toEqualTypeOf<(a: number, b: number) => boolean>();
  expectTypeOf<WatchFn>().toEqualTypeOf<(onCleanup: OnCleanup) => void>();
});
