// Effects: code that runs again whenever the signals it read change, as part
// of the app's change detection. Created through the Effects service:
//
//   class Counter {
//     private readonly effects = inject(Effects);
//     readonly count = signal(0);
//
//     constructor() {
//       this.effects.create(({ isFirst, onCleanup }) => {
//         const id = setInterval(refresh, period());   // reads a signal
//         onCleanup(() => clearInterval(id));          // before the next run, and on destroy
//         if (isFirst) log("started");                 // only on the first run
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
// A service, not a free function: the dependency is visible (a field), and
// `create` can be called at any moment, not only during construction.
//
// Or declaratively, with the @Effect() decorator on a method:
//
//   class Counter {
//     @Effect() syncTitle({ isFirst }: EffectContext) {
//       document.title = `${this.count()} clicks`;
//     }
//   }
//
// The method becomes an effect when the instance is created (which must
// happen in an injection context, as for any inject()).
//
// Not yet: destroying effects automatically with their owner (see "Effects
// and render hooks" in IMPROVEMENTS.md). Until then, destroy an effect
// yourself with the returned handle when its owner goes away.

import { inject, Injectable } from "../../di/index.ts";
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

/** Creates effects in the engine's change detection. One per engine. */
@Injectable()
export class Effects {
  private readonly changeDetection = inject(ChangeDetection);

  /** Run `fn` in the next tick, then whenever the signals it read change, in the effects phase. */
  create(fn: EffectFn): Watch {
    let isFirst = true;
    return watch((onCleanup) => {
      const context: EffectContext = { isFirst, onCleanup };
      isFirst = false;
      fn(context);
    }, this.changeDetection.effects);
  }
}

/** A method an effect can run: it receives the run's context, with the instance as `this`. */
type EffectMethod = (this: object, context: EffectContext) => void;

/**
 * Decorator form of `Effects.create`: the method becomes an effect of each
 * instance, created when the instance is (in its injection context).
 */
export function Effect() {
  return (method: EffectMethod, context: ClassMethodDecoratorContext<object, EffectMethod>): void => {
    context.addInitializer(function () {
      inject(Effects).create((run) => method.call(this, run));
    });
  };
}
