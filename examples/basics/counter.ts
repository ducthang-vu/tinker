// Components, providers and outputs: each <tk-counter> provides its own
// CounterStore. Its buttons use the [step] directive, which injects that store
// and changes it on click, and emits what it did through its `stepped` output.
// The template handles that with (stepped), and shows the store's signals.

import { inject, Injectable } from "../../src/di/index.ts";
import { computed, signal } from "../../src/signals/index.ts";
import { Component, Directive, input, output } from "../../src/view/index.ts";
import { Highlight, Tooltip } from "./highlight.ts";

/** The state of one counter: provided by each <tk-counter>. */
@Injectable()
export class CounterStore {
  readonly count = signal(0);
  readonly parity = computed(() => (this.count() % 2 === 0 ? "even" : "odd"));
  readonly negative = computed(() => this.count() < 0);

  add(amount: number): void {
    this.count.update((count) => count + amount);
  }
}

/** On click, adds `step` to the store of the counter it is in, and emits it. */
@Directive({ selector: "[step]", host: { "(click)": "apply()" } })
export class Step {
  private readonly store = inject(CounterStore);
  /** From the `step` attribute: a string, like every attribute. */
  private readonly step = input("1");
  /** Each change made, for the template that uses this directive. */
  private readonly stepped = output<number>();

  apply(): void {
    const amount = Number(this.step());
    this.store.add(amount);
    this.stepped.emit(amount);
  }
}

@Component({
  selector: "tk-counter",
  template: `
    <h2>Counter</h2>
    <p highlight [class.negative]="store.negative()">Count: {{ store.count() }} ({{ store.parity() }})</p>
    <p>{{ last() }}</p>
    <button step="-1" (stepped)="onStep($event)" highlight style="--highlight: #ffd7d7" tooltip="Remove one">-1</button>
    <button step="1" (stepped)="onStep($event)" highlight style="--highlight: lightgreen" tooltip="Add one">+1</button>
    <button step="10" (stepped)="onStep($event)" highlight style="--highlight: lightblue" tooltip="Add ten">+10</button>
  `,
  imports: [Step, Highlight, Tooltip],
  providers: [CounterStore],
})
export class Counter {
  readonly store = inject(CounterStore);
  readonly last = signal("no change yet");

  /** Called by each button's `stepped` output, with the amount it applied. */
  onStep(amount: number): void {
    this.last.set(`last change: ${amount > 0 ? "+" : ""}${amount}`);
  }
}
