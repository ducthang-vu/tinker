// The ticker: decides WHEN change detection ticks. One per engine.
//
// Schedulers ask it for a tick whenever they get work (`requestTick`). It
// runs at most one tick per microtask, however many requests come in, by
// calling the tick registered with `onTick` (ChangeDetection registers its
// own). What a tick does is ChangeDetection's business, not the ticker's.
//
// Requests made during a tick are covered by it: the next request after
// the tick schedules a new one. This is the one place to change if ticks
// should run at another moment (see "Several cycles with async code" in
// IMPROVEMENTS.md).

import { Injectable } from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";

@Injectable()
export class Ticker {
  private tick = Maybe.none<() => void>();
  private tickRequested = false;

  /** Register what a tick does (ChangeDetection's `tick`). Replaces an earlier one. */
  onTick(tick: () => void): void {
    this.tick = Maybe.some(tick);
  }

  /** Run a tick soon: at most one per microtask, however often it is called. */
  requestTick(): void {
    if (this.tickRequested) {
      return;
    }
    this.tickRequested = true;
    queueMicrotask(() => {
      try {
        this.tick.ifSome((tick) => tick());
      } finally {
        // Only now: requests made during the tick were handled by it.
        this.tickRequested = false;
      }
    });
  }
}
