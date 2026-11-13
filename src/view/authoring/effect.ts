// Effects: code that runs again whenever the signals it read change, as part
// of the app's change detection.
//
//   class Counter {
//     readonly count = signal(0);
//     constructor() {
//       effect(() => {
//         document.title = `${this.count()} clicks`;
//       });
//     }
//   }
//
// An effect is a signals `watch` whose scheduler is the engine's
// EffectScheduler: the author only writes the function. Its first run, and
// every re-run, happens in the effects phase of a tick, before the views
// render, so the state the views read has settled.
//
// The function receives a context with hooks for its run:
//
//   effect(({ isFirst, onCleanup }) => {
//     const id = setInterval(refresh, period());   // reads a signal
//     onCleanup(() => clearInterval(id));          // before the next run, and on destroy
//     if (isFirst) log("started");                 // only on the first run
//   });
//
// Like `inject()`, `effect()` must be called in an injection context: in a
// service, component or directive (in a field initializer or the
// constructor), so it finds the engine it belongs to.
//
// Not yet: destroying effects automatically with their owner (see
// "Effects" in IMPROVEMENTS.md). Until then, destroy an effect yourself
// with the returned handle when its owner goes away.

import { inject } from "../../di/index.ts";
import { type OnCleanup, type Watch, watch } from "../../signals/index.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";

/** What an effect's function receives on each run. */
export interface EffectContext {
  /** Whether this is the effect's first run. */
  readonly isFirst: boolean;
  /**
   * Register `cleanup`, to undo what this run did: it runs before the next
   * run, and when the effect is destroyed.
   */
  readonly onCleanup: OnCleanup;
}

/** An effect's function: what to do, given the hooks of this run. */
export type EffectFn = (context: EffectContext) => void;

/** Run `fn` in the next tick, then whenever the signals it read change, in the effects phase. */
export function effect(fn: EffectFn): Watch {
  let isFirst = true;
  return watch((onCleanup) => {
    const context: EffectContext = { isFirst, onCleanup };
    isFirst = false;
    fn(context);
  }, inject(ChangeDetection).effects);
}
