import { tracked } from "./context/active-consumer.ts";
import { afterMarking } from "./context/marking.ts";
import { WatchLoopError } from "./errors.ts";
import { DependenciesContainer } from "./graph/dependencies-container.ts";
import type { Consumer, Producer } from "./types.ts";

/** Registers a function to run before the next run, and on destroy. */
export type OnCleanup = (cleanup: () => void) => void;

/** The function a watch runs. It is tracked: every signal it reads is a dependency. */
export type WatchFn = (onCleanup: OnCleanup) => void;

/** Something a scheduler can run. */
export interface Runnable {
  run(): void;
}

/**
 * Decides *when* a watch runs. For example:
 *   - synchronously:  { schedule: (task) => task.run() }
 *   - in a microtask: { schedule: (task) => queueMicrotask(() => task.run()) }
 */
export interface WatchScheduler {
  /**
   * Called when a watch may need to re-run (and once when it is created).
   * Must eventually call `task.run()`.
   */
  schedule(task: Runnable): void;
}

/** How many times in a row a watch may re-run because it changed its own dependencies. */
const MAX_RERUNS = 100;

/**
 * Runs a function, tracks the signals it reads, and asks its scheduler to
 * run it again when any of them change. The base for effects.
 *
 * The first run is scheduled as soon as the watch is created.
 */
export class Watch implements Consumer, Runnable {
  /** A watch runs side effects, so it may write signals. */
  readonly allowWrites = true;

  private readonly dependencies = new DependenciesContainer();

  /** True when a dependency may have changed since the last run. */
  private dirty = false;
  private hasRun = false;
  private destroyed = false;
  /** True while `run()` is executing, to stop a run from starting inside itself. */
  private running = false;
  private cleanup: (() => void) | undefined;

  constructor(
    private readonly fn: WatchFn,
    private readonly scheduler: WatchScheduler,
  ) {
    this.markDirty();
  }

  // As a consumer

  addDependency(producer: Producer): void {
    this.dependencies.add(producer);
  }

  markDirty(): void {
    // Already dirty: a run is already scheduled.
    if (this.dirty || this.destroyed) {
      return;
    }
    this.dirty = true;
    // The scheduler is user code: never call it in the middle of marking.
    afterMarking(() => this.scheduler.schedule(this));
  }

  /**
   * Run the function if a dependency really changed (or it never ran).
   * Usually called by the scheduler.
   *
   * If the function changes one of its own dependencies, the watch becomes
   * dirty again while running. Instead of running inside itself, it runs
   * again right after, until it is clean (or MAX_RERUNS is reached).
   */
  run(): void {
    if (this.running) {
      // Called from inside our own run (e.g. by a synchronous scheduler).
      // `dirty` stays true, so the loop below runs again once we are done.
      return;
    }
    this.running = true;
    try {
      let runs = 0;
      while (this.dirty && !this.destroyed) {
        if (++runs > MAX_RERUNS) {
          throw new WatchLoopError(MAX_RERUNS);
        }
        this.runOnce();
      }
    } catch (error) {
      // Don't stay stuck as dirty: that would block future scheduling.
      // The recorded versions still let the next notification catch up.
      this.dirty = false;
      throw error;
    } finally {
      this.running = false;
    }
  }

  private runOnce(): void {
    // Clear first, so a change made during the run marks us dirty again.
    this.dirty = false;
    if (this.hasRun && !this.dependencies.changed()) {
      return;
    }
    this.hasRun = true;
    this.runCleanup();
    this.dependencies.start();
    try {
      this.execute();
    } finally {
      this.dependencies.finish(this);
    }
  }

  /** Stop watching: unsubscribe from everything and run the last cleanup. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.dependencies.clear(this);
    this.runCleanup();
  }

  @tracked
  private execute(): void {
    this.fn((cleanup) => {
      this.cleanup = cleanup;
    });
  }

  private runCleanup(): void {
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    cleanup?.();
  }
}
