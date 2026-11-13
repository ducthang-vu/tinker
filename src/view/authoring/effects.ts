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
// Effects stop with their owner: a component's effects (decorated ones
// included) are destroyed with the component, since each component injector
// provides its own Effects. The returned handle stops one earlier.

import { inject, Injectable } from "../../di/index.ts";
import { type OnCleanup, type Watch, watch } from "../../signals/index.ts";
import { runAll } from "../../utils/run-all.ts";
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

/**
 * Creates effects in the engine's change detection. Each component has its
 * own (provided in its injector), the engine has one for services: the
 * effects created through it are destroyed when its injector is.
 */
@Injectable()
export class Effects {
  private readonly changeDetection = inject(ChangeDetection);
  /** The effects created here and not destroyed yet. */
  private readonly running = new Set<Watch>();

  /** Run `fn` in the next tick, then whenever the signals it read change, in the effects phase. */
  create(fn: EffectFn): Watch {
    let isFirst = true;
    const effect = watch((onCleanup) => {
      const context: EffectContext = { isFirst, onCleanup };
      isFirst = false;
      fn(context);
    }, this.changeDetection.effects);
    const handle: Watch = {
      destroy: () => {
        this.running.delete(handle);
        effect.destroy();
      },
    };
    this.running.add(handle);
    return handle;
  }

  /** Called when its injector is destroyed: destroy every effect still running. */
  onDestroy(): void {
    runAll([...this.running].map((effect) => () => effect.destroy()));
  }
}

/** A method an effect can run: it receives the run's context, with the instance as `this`. */
type EffectMethod = (this: object, context: EffectContext) => void;

/**
 * Decorator form of `Effects.create`: the method becomes an effect of each
 * instance, created when the instance is (in its injection context).
 */
export function Effect() {
  return (
    method: EffectMethod,
    context: ClassMethodDecoratorContext<object, EffectMethod>,
  ): void => {
    context.addInitializer(function () {
      inject(Effects)
        .create((run) => method.call(this, run));
    });
  };
}
