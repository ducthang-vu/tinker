// Change detection: WHAT a tick does. One per engine, for its whole life;
// each `tick()` is one cycle.
//
// It drains one queue per phase, in phase order:
//   - `effects` (EffectScheduler): effects to re-run, first, so state settles;
//   - `views` (ViewScheduler): views to re-render.
// Watches are given the queue of their phase (a view's watch gets `views`).
// Queuing work asks the Ticker for a tick; the Ticker decides WHEN (one per
// microtask) and calls `tick()`, registered here. A tick drains the queues
// in phase order, round after round, until both are empty:
//
//   tick:
//     round 1: flush effects (if any), then views (if any)
//     round 2: again, if a round created new work (an effect writing a
//              signal a view reads, a view update writing a signal, ...)
//     ...      until no queue has work: settled
//
// A tick that does not settle within 100 rounds is an endless loop: it
// throws ChangeDetectionLoopError and drops the queued work. Every queued
// task runs even if some throw; the first error is re-thrown once the tick
// is over.

import { inject, Injectable } from "../../di/index.ts";
import { runBatches } from "../../utils/run-all.ts";
import { EffectScheduler } from "./schedulers/effect-scheduler.ts";
import { Ticker } from "./ticker.ts";
import { ViewScheduler } from "./schedulers/view-scheduler.ts";

/** How many rounds a tick may take before it is considered an endless loop. */
const MAX_ROUNDS = 100;

/** Thrown when a tick does not settle: updates keep creating more updates. */
export class ChangeDetectionLoopError extends Error {
  constructor(rounds: number) {
    super(
      `Change detection did not settle after ${rounds} rounds: an update probably writes a signal ` +
        `that something updated in the same tick reads`,
    );
    this.name = "ChangeDetectionLoopError";
  }
}

@Injectable()
export class ChangeDetection {
  /** The effects to re-run. Runs first in each round. */
  readonly effects = inject(EffectScheduler);
  /** The views to re-render. Runs after the effects in each round. */
  readonly views = inject(ViewScheduler);

  /** The phases, in the order a round flushes them. */
  private readonly phases = [this.effects, this.views];

  constructor() {
    inject(Ticker).onTick(() => this.tick());
  }

  /** Run a tick now: every queued task, phase by phase, round after round, until settled. */
  tick(): void {
    let rounds = 0;
    runBatches(() => {
      const due = this.phases.filter((phase) => phase.pending > 0);
      if (due.length > 0 && ++rounds > MAX_ROUNDS) {
        for (const phase of this.phases) {
          phase.discard();
        }
        throw new ChangeDetectionLoopError(MAX_ROUNDS);
      }
      return due.map((phase) => () => phase.flush());
    });
  }
}
