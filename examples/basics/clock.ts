// An effect and a lifecycle hook: the clock ticks with an @Effect method,
// which clears its interval when the clock is destroyed, and logs its first
// render with @AfterNextRender.

import { computed, signal } from "@tinker/core";
import {
  AfterNextRender,
  Component,
  Effect,
  type EffectContext,
} from "@tinker/core";
import { Highlight, Tooltip } from "./highlight.ts";

@Component({
  selector: "tk-clock",
  template: `
    <h2>Clock</h2>
    <p highlight style="--highlight: lavender" tooltip="Updated every second">{{ time() }}</p>
  `,
  imports: [Highlight, Tooltip],
})
export class Clock {
  private readonly now = signal(new Date());
  readonly time = computed(() => this.now()
    .toLocaleTimeString());

  /** Reads no signal: runs once. Its cleanup runs when the clock is destroyed. */
  @Effect() tick({ onCleanup }: EffectContext): void {
    const id = setInterval(() => this.now.set(new Date()), 1000);
    onCleanup(() => clearInterval(id));
  }

  @AfterNextRender() ready(): void {
    console.info("Clock rendered:", this.time());
  }
}
