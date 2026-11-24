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

import { Injectable } from "../../../di/index.ts";

@Injectable()
export class Ticker {
  /** What a tick does: nothing until ChangeDetection registers its tick. */
  private tick: () => void = () => {};
  private tickRequested = false;

  /** Register what a tick does (ChangeDetection's `tick`). Replaces an earlier one. */
  onTick(tick: () => void): void {
    this.tick = tick;
  }

  /**
   * Run a tick soon, once however often it is called. The tick waits for the next frame
   * or a timer, whichever comes first: a write made in the same task, or after an `await`
   * that resolves within it, is covered by the same tick. A frame is not drawn before the
   * tick runs, so the screen never shows a value the bindings have not written. The timer
   * is the fallback for a background tab, where no frame is drawn.
   */
  requestTick(): void {
    if (this.tickRequested) {
      return;
    }
    this.tickRequested = true;
    // Whichever fires first cancels the other, so the tick runs once.
    const run = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      try {
        this.tick();
      } finally {
        // Only now: requests made during the tick were handled by it.
        this.tickRequested = false;
      }
    };
    const frame = requestAnimationFrame(run);
    const timer = setTimeout(run);
  }
}
