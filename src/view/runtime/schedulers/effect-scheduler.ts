// The effect scheduler: the queue of effects to re-run, the first of the two
// phases of change detection (see ChangeDetection, which drains it
// as `changeDetection.effects`). Effects run before the views in each round,
// so the state the views read has settled.
//
// An effect's watch is given this scheduler. When it may need to re-run, it
// asks this scheduler, which queues it (once, however often it is asked) and
// requests a tick.

import { inject, Injectable } from "../../../di/index.ts";
import type { Runnable, WatchScheduler } from "../../../signals/index.ts";
import { runAll } from "../../../utils/run-all.ts";
import { Ticker } from "../ticker.ts";

@Injectable()
export class EffectScheduler implements WatchScheduler {
  private readonly queue = new Set<Runnable>();

  /** Asked for a tick whenever an effect is queued. */
  private readonly ticker = inject(Ticker);

  /** How many effects are queued. */
  get pending(): number {
    return this.queue.size;
  }

  /** Queue an effect's watch (once, however often it is scheduled) and request a tick. */
  schedule(task: Runnable): void {
    this.queue.add(task);
    this.ticker.requestTick();
  }

  /**
   * Run the effects queued now, as one batch. Effects scheduled meanwhile
   * stay queued for the next round of the tick. Every effect runs even if
   * one throws; the first error is re-thrown at the end.
   */
  flush(): void {
    const tasks = [...this.queue];
    this.queue.clear();
    runAll(tasks.map((task) => () => task.run()));
  }

  /** Drop the queued effects (e.g. after an endless loop was detected). */
  discard(): void {
    this.queue.clear();
  }
}
