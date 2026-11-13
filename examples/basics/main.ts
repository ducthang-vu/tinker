// Tinker basics: two components and three directives, on one engine.
//
// - <tk-counter> provides its own CounterStore (one per counter). Its
//   buttons use the [step] directive, which injects that store and changes
//   it on click; the template shows the store's signals with {{ }}.
// - <tk-clock> ticks with an effect, which clears its interval when the
//   clock is destroyed, and logs its first render with a render hook.
// - [highlight] and [tooltip] work on any element: through the RENDERER
//   and ElementRef, with inputs set from plain attributes.

import { inject, Injectable } from "../../src/di/index.ts";
import { computed, signal } from "../../src/signals/index.ts";
import {
  AfterNextRender,
  Component,
  Directive,
  Effects,
  ElementRef,
  Engine,
  input,
  RENDERER,
} from "../../src/view/index.ts";

/** The state of one counter: provided by each <tk-counter>. */
@Injectable()
class CounterStore {
  readonly count = signal(0);
  readonly parity = computed(() => (this.count() % 2 === 0 ? "even" : "odd"));

  add(amount: number): void {
    this.count.update((count) => count + amount);
  }
}

/** On click, adds `step` to the store of the counter it is in. */
@Directive({ selector: "[step]", host: { "(click)": "apply()" } })
class Step {
  private readonly store = inject(CounterStore);
  /** From the `step` attribute: a string, like every attribute. */
  readonly step = input("1");

  apply(): void {
    this.store.add(Number(this.step()));
  }
}

/** Colours its element's background while the pointer is over it. */
@Directive({ selector: "[highlight]", host: { "(mouseenter)": "on()", "(mouseleave)": "off()" } })
class Highlight {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(RENDERER);
  /** From the `color` attribute, if any. */
  readonly color = input("gold");

  on(): void {
    this.renderer.setStyle(this.host.nativeElement, "background-color", this.color());
  }

  off(): void {
    this.renderer.removeStyle(this.host.nativeElement, "background-color");
  }
}

/** Shows its text as the element's native tooltip (its title). */
@Directive({ selector: "[tooltip]" })
class Tooltip {
  /** From the `tooltip` attribute itself. */
  readonly tooltip = input<string>();

  constructor() {
    const host = inject(ElementRef);
    const renderer = inject(RENDERER);
    inject(Effects)
      .create(() => renderer.setAttribute(host.nativeElement, "title", this.tooltip()));
  }
}

@Component({
  selector: "tk-counter",
  template: `
    <h2>Counter</h2>
    <p highlight>Count: {{ store.count() }} ({{ store.parity() }})</p>
    <button step="-1" highlight tooltip="Remove one">-1</button>
    <button step="1" highlight color="lightgreen" tooltip="Add one">+1</button>
    <button step="10" highlight color="lightblue" tooltip="Add ten">+10</button>
  `,
  imports: [Step, Highlight, Tooltip],
  providers: [CounterStore],
})
class Counter {
  readonly store = inject(CounterStore);
}

@Component({
  selector: "tk-clock",
  template: `
    <h2>Clock</h2>
    <p highlight color="lavender" tooltip="Updated every second">{{ time() }}</p>
  `,
  imports: [Highlight, Tooltip],
})
class Clock {
  private readonly now = signal(new Date());
  readonly time = computed(() => this.now()
    .toLocaleTimeString());

  constructor() {
    // Reads no signal: runs once. Its cleanup runs when the clock is destroyed.
    inject(Effects)
      .create(({ onCleanup }) => {
        const id = setInterval(() => this.now.set(new Date()), 1000);
        onCleanup(() => clearInterval(id));
      });
  }

  @AfterNextRender() ready(): void {
    console.info("Clock rendered:", this.time());
  }
}

const engine = Engine.create();
engine.bootstrap(Counter);
engine.bootstrap(Clock);
