// The view scheduler: the queue of views to re-render, one of the two
// phases of change detection (see ChangeDetection, which drains it
// as `changeDetection.views`).
//
// Every view has a watch (see ComponentFactory), given this scheduler. When
// the watch may need to re-run, it asks this scheduler, which queues it
// (once, however often it is asked) and requests a tick. The tick flushes
// the queue, parents first: only the views that were scheduled re-render. Known
// gaps: see "Change detection" in IMPROVEMENTS.md.

import { inject, Injectable } from "../../../../di/index.ts";
import type { Runnable, WatchScheduler } from "../../../../signals/index.ts";
import { runAll } from "../../../../utils/run-all.ts";
import { Ticker } from "../ticker.ts";

/**
 * A view's place in the view tree: a direct link to the node of the view that
 * owns it (the view holding its host element, or the view a container was
 * attached to). A root view has no owner.
 */
export interface ViewNode {
  readonly owner?: ViewNode;
}

/** How many owners a view has, found by following its direct links. */
function rankOf(node: ViewNode): number {
  let rank = 0;
  for (let owner = node.owner; owner !== undefined; owner = owner.owner) {
    rank += 1;
  }
  return rank;
}

@Injectable()
export class ViewScheduler implements WatchScheduler {
  /** The queued updates, each with the node of its view. */
  private readonly queue = new Map<Runnable, ViewNode>();

  /** Asked for a tick whenever a view is queued. */
  private readonly ticker = inject(Ticker);

  /** How many view updates are queued. */
  get pending(): number {
    return this.queue.size;
  }

  /**
   * Queue a view's watch, once however often it is scheduled, and request a tick.
   * `node` is the view's place in the view tree: a view's update runs after the
   * updates of the views that own it (see `flush`).
   */
  schedule(task: Runnable, node: ViewNode = {}): void {
    this.queue.set(task, node);
    this.ticker.requestTick();
  }

  /** A watch scheduler for the views of `node`, as the watches of those views need. */
  forNode(node: ViewNode): WatchScheduler {
    return { schedule: (task) => this.schedule(task, node) };
  }

  /**
   * Run the view updates queued now, as one batch, parents first: an update can
   * change the inputs of the views inside it, which then run after it. Updates of
   * the same owner depth keep the order they were queued in. Updates scheduled meanwhile
   * stay queued for the next round of the tick. Every update runs even if one
   * throws; the first error is re-thrown at the end.
   */
  flush(): void {
    const tasks = [...this.queue]
      .sort(([, left], [, right]) => rankOf(left) - rankOf(right))
      .map(([task]) => task);
    this.queue.clear();
    runAll(tasks.map((task) => () => task.run()));
  }

  /** Drop the queued updates (e.g. after an endless loop was detected). */
  discard(): void {
    this.queue.clear();
  }
}
