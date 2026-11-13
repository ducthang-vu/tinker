// The render hook registry: where render hooks are kept, and run. Internal:
// authors register hooks through RenderHooks (which only adds them); only
// ChangeDetection runs them, after a round in which views rendered.

import { Injectable } from "../../di/index.ts";
import type { Cancel } from "../../functional/index.ts";
import { runAll } from "../../utils/run-all.ts";

@Injectable()
export class RenderHookRegistry {
  private readonly everyRender = new Set<() => void>();
  private readonly nextRender = new Set<() => void>();

  /** Run `hook` after every render, until cancelled. */
  addEachRender(hook: () => void): Cancel {
    return this.add(this.everyRender, hook);
  }

  /** Run `hook` once, after the next render. Cancelling before that prevents it. */
  addNextRender(hook: () => void): Cancel {
    return this.add(this.nextRender, hook);
  }

  /** Whether any hook is registered. */
  get hasHooks(): boolean {
    return this.everyRender.size > 0 || this.nextRender.size > 0;
  }

  /**
   * The app rendered (called by ChangeDetection): run every hook, each-render
   * ones first, then next-render ones (which are then dropped). A hook
   * registered while they run waits for the next render. Every hook runs even
   * if one throws; the first error is re-thrown.
   */
  rendered(): void {
    const once = [...this.nextRender];
    this.nextRender.clear();
    runAll([...this.everyRender, ...once]);
  }

  private add(hooks: Set<() => void>, hook: () => void): Cancel {
    // Wrapped, so the same function registered twice runs twice.
    const entry = () => hook();
    hooks.add(entry);
    return () => {
      hooks.delete(entry);
    };
  }
}
