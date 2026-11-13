// The view scheduler: the queue of views to re-render, one of the two
// phases of change detection (see ChangeDetection, which drains it
// as `changeDetection.views`).
//
// Every view has a watch (see ComponentFactory), given this scheduler. When
// the watch may need to re-run, it asks this scheduler, which queues it
// (once, however often it is asked) and requests a tick. The tick flushes
// the queue: only the views that were scheduled re-render. Known gaps
// (parents first, ...): see "Change detection" in IMPROVEMENTS.md.

import { inject, Injectable } from "../../../di/index.ts";
import type { Runnable, WatchScheduler } from "../../../signals/index.ts";
import { runAll } from "../../../utils/run-all.ts";
import { Ticker } from "../ticker.ts";

@Injectable()
export class ViewScheduler implements WatchScheduler {
  private readonly queue = new Set<Runnable>();

  /** Asked for a tick whenever a view is queued. */
  private readonly ticker = inject(Ticker);

  /** How many view updates are queued. */
  get pending(): number {
    return this.queue.size;
  }

  /** Queue a view's watch (once, however often it is scheduled) and request a tick. */
  schedule(task: Runnable): void {
    this.queue.add(task);
    this.ticker.requestTick();
  }

  /**
   * Run the view updates queued now, as one batch. Updates scheduled
   * meanwhile stay queued for the next round of the tick. Every update runs
   * even if one throws; the first error is re-thrown at the end.
   */
  flush(): void {
    const tasks = [...this.queue];
    this.queue.clear();
    runAll(tasks.map((task) => () => task.run()));
  }

  /** Drop the queued updates (e.g. after an endless loop was detected). */
  discard(): void {
    this.queue.clear();
  }
}
