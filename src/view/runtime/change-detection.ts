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
//
// To know when a tick is over: `nextTick()`, a Task completing at the end
// of the next tick (run it again to follow every tick).

import { inject, Injectable } from "../../di/index.ts";
import { Task } from "../../functional/index.ts";
import { runAll, runBatches } from "../../utils/run-all.ts";
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
  private readonly ticker = inject(Ticker);
  /** Who waits for the end of the next tick (running `nextTick()` tasks). */
  private readonly waiting = new Set<() => void>();

  constructor() {
    this.ticker.onTick(() => this.tick());
  }

  /**
   * The end of the next tick, as a Task: lazy (nothing happens until it is
   * run), and cancellable. Running it requests a tick, so it completes even
   * when nothing else is pending. It completes after a failed tick too.
   *
   * To follow every tick, run it again when it completes: it then waits for
   * the following tick, but does not force one (otherwise following would
   * chain ticks forever): that tick comes with the next change.
   *
   *   await changeDetection.nextTick().toPromise();   // e.g. in a test
   */
  nextTick(): Task<void> {
    return Task.create((ok) => {
      const waiter = () => ok();
      this.waiting.add(waiter);
      this.ticker.requestTick();
      return () => this.waiting.delete(waiter);
    });
  }

  /**
   * Run a tick now: every queued task, phase by phase, round after round,
   * until settled. Then the `nextTick()` tasks waiting for it complete, even
   * if the tick failed. Work they queue (e.g. a waiter writing a signal a
   * view reads) still runs in this tick: no tick request is lost while the
   * Ticker considers this tick running. Every step runs even if an earlier
   * one throws; the first error is re-thrown at the end.
   */
  tick(): void {
    const rounds = { count: 0 }; // one loop guard for the whole tick
    runAll([
      () => this.settle(rounds),
      () => this.completeWaiters(),
      () => this.settle(rounds),
    ]);
  }

  /**
   * Complete the `nextTick()` tasks waiting now. A snapshot: a task run
   * again while completing waits for the next tick (which it does not force,
   * see `nextTick`).
   */
  private completeWaiters(): void {
    const waiters = [...this.waiting];
    this.waiting.clear();
    runAll(waiters);
  }

  /** Flush the phases, round after round, until none has work. */
  private settle(rounds: { count: number }): void {
    runBatches(() => {
      const due = this.phases.filter((phase) => phase.pending > 0);
      if (due.length > 0 && ++rounds.count > MAX_ROUNDS) {
        for (const phase of this.phases) {
          phase.discard();
        }
        throw new ChangeDetectionLoopError(MAX_ROUNDS);
      }
      return due.map((phase) => () => phase.flush());
    });
  }
}
