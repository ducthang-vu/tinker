// The view scheduler: the app's queue for view updates.
//
// Every view has a watch (see ComponentFactory). When a watch may need to
// re-run, it asks this scheduler, which queues it and flushes the queue in a
// microtask: many signal changes in one tick lead to a single flush, and each
// queued watch runs once. Only watches that were scheduled run; the others
// are not touched.
//
// There is one per engine (provided in its root injector), so two apps on
// one page, or two tests, never share a queue. It can be replaced with a
// provider, e.g. a synchronous scheduler for tests.
//
// Not yet: running parents before children (no child components exist yet).

import { Injectable } from "../di/index.ts";
import type { Runnable, WatchScheduler } from "../signals/index.ts";
import { runBatches } from "../utils/run-all.ts";

@Injectable()
export class ViewScheduler implements WatchScheduler {
  private readonly queue = new Set<Runnable>();
  private flushRequested = false;

  /** How many tasks are waiting for the next flush. */
  get pending(): number {
    return this.queue.size;
  }

  /** Queue `task` (once, however often it is scheduled) and request a flush. */
  schedule(task: Runnable): void {
    this.queue.add(task);
    if (!this.flushRequested) {
      this.flushRequested = true;
      queueMicrotask(() => this.flush());
    }
  }

  /**
   * Run every queued task now. Tasks scheduled while flushing run in the same
   * flush. Every task runs even if one throws; the first error is re-thrown
   * at the end.
   */
  flush(): void {
    this.flushRequested = false;
    runBatches(() => this.takeQueued());
  }

  /** Empty the queue, returning what it held, as functions to run. */
  private takeQueued(): (() => void)[] {
    const tasks = [...this.queue].map((task) => () => task.run());
    this.queue.clear();
    return tasks;
  }
}
