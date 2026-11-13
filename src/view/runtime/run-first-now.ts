// RunFirstNow: a WatchScheduler for a view's watch, making the first render
// synchronous.
//
// A watch asks its scheduler to run it once when it is created, then again
// each time a dependency changes. This scheduler runs that first request
// right away, so a view is complete when it is created, and passes every
// later request to the app's scheduler (`next`).
//
// The first run's error is kept, not thrown: `watch()` returns normally, so
// the caller holds the watch and can clean up (destroy the view, which
// destroys the watch) before re-throwing.
//
//   const firstRun = new RunFirstNow(scheduler);
//   const viewWatch = watch(() => template.update(), firstRun);
//   firstRun.failure.ifSome((error) => { cleanUp(); throw error; });

import { Either, Maybe } from "../../functional/index.ts";
import type { Runnable, WatchScheduler } from "../../signals/index.ts";

export class RunFirstNow implements WatchScheduler {
  private first = true;
  private firstFailure = Maybe.none<unknown>();

  /** @param next The scheduler for every request after the first. */
  constructor(private readonly next: WatchScheduler) {}

  /** What the first run threw, if anything (None before the first run). */
  get failure(): Maybe<unknown> {
    return this.firstFailure;
  }

  schedule(task: Runnable): void {
    if (!this.first) {
      this.next.schedule(task);
      return;
    }
    this.first = false;
    this.firstFailure = Either.tryCatch(() => task.run())
      .match({
        left: Maybe.some,
        right: () => Maybe.none(),
      });
  }
}
