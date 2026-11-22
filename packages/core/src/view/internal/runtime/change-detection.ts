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
//     ...      once both are empty, if views rendered: a round running the
//              render hooks (see RenderHookRegistry); what they change is flushed
//              in the next rounds
//     round 2: again, if a round created new work (an effect writing a
//              signal a view reads, a view update writing a signal, ...)
//     ...      until no queue has work: settled
//
// A tick that does not settle within 100 rounds is an endless loop: it
// throws ChangeDetectionLoopError and drops the queued work. Every queued
// task runs even if some throw; the first error is re-thrown once the tick
// is over.
//
// A caller that needs the ticks to be over flushes them (`flush`), or waits for
// the microtasks that request them and then flushes (the test bed does this).

import { inject, Injectable } from "../../../di/index.ts";
import { runAll, runBatches } from "../../../utils/run-all.ts";
import { EffectScheduler } from "./schedulers/effect-scheduler.ts";
import { RenderHookRegistry } from "./render-hook-registry.ts";
import { Ticker } from "./ticker.ts";
import { ViewScheduler } from "./schedulers/view-scheduler.ts";

/** How many rounds a tick may take before it is considered an endless loop. */
const MAX_ROUNDS = 100;

/** Thrown when a tick does not settle: updates keep creating more updates. */
export class ChangeDetectionLoopError extends Error {
  constructor(rounds: number) {
    super(
      `Change detection did not settle after ${rounds} rounds: an update probably writes a signal `
      + `that something updated in the same tick reads`,
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
  /** Run once effects and views settled, if views rendered since they last ran. */
  private readonly renderHooks = inject(RenderHookRegistry);
  private viewsRendered = false;
  private readonly ticker = inject(Ticker);

  constructor() {
    this.ticker.onTick(() => this.tick());
  }

  /**
   * A view rendered outside a tick (its first render, during its creation):
   * request a tick, whose render hooks then run as if it had rendered there.
   */
  viewRendered(): void {
    this.viewsRendered = true;
    this.ticker.requestTick();
  }

  /**
   * Run a tick now: every queued task, phase by phase, round after round, until
   * settled. One loop guard covers the whole tick.
   */
  tick(): void {
    this.settle({ count: 0 });
  }

  /**
   * Flush the phases, round after round, until none has work. Once they
   * settled, if views rendered, run the render hooks, as a round of their
   * own: work they create (a signal write) is flushed in the next rounds.
   */
  private settle(rounds: { count: number }): void {
    runBatches(() => {
      const batch = this.nextBatch();
      if (batch.length > 0 && ++rounds.count > MAX_ROUNDS) {
        for (const phase of this.phases) {
          phase.discard();
        }
        this.viewsRendered = false;
        throw new ChangeDetectionLoopError(MAX_ROUNDS);
      }
      return batch;
    });
  }

  /**
   * The next round: the phases with work, else the render hooks if views
   * rendered, else nothing.
   */
  private nextBatch(): (() => void)[] {
    const due = this.phases.filter((phase) => phase.pending > 0);
    if (due.length > 0) {
      this.viewsRendered ||= due.includes(this.views);
      return due.map((phase) => () => phase.flush());
    }
    if (this.viewsRendered && this.renderHooks.hasHooks) {
      this.viewsRendered = false;
      return [() => this.renderHooks.rendered()];
    }
    this.viewsRendered = false;
    return [];
  }
}
