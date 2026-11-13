// Tinker basics: two components and three directives, on one engine.
//
// - <tk-counter> provides its own CounterStore (one per counter). Its
//   buttons use the [step] directive, which injects that store and changes
//   it on click; the template shows the store's signals with {{ }}.
// - <tk-clock> ticks with an effect, which clears its interval when the
//   clock is destroyed, and logs its first render with a render hook.
// - [highlight] toggles a class on any element with a host class binding;
//   [tooltip] sets its title through the RENDERER and ElementRef, with an
//   input set from a plain attribute. The counter's paragraph turns red
//   below zero with a template class binding.

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
  readonly negative = computed(() => this.count() < 0);

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

/**
 * Marks its element as highlighted while the pointer is over it: a host
 * class binding follows the `hovered` signal; the colour is CSS's business
 * (the `--highlight` variable, set per element in the template).
 */
@Directive({
  selector: "[highlight]",
  host: {
    "[class.highlighted]": "hovered()",
    "(mouseenter)": "enter()",
    "(mouseleave)": "leave()",
  },
})
class Highlight {
  readonly hovered = signal(false);

  enter(): void {
    this.hovered.set(true);
  }

  leave(): void {
    this.hovered.set(false);
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
    <p highlight [class.negative]="store.negative()">Count: {{ store.count() }} ({{ store.parity() }})</p>
    <button step="-1" highlight style="--highlight: #ffd7d7" tooltip="Remove one">-1</button>
    <button step="1" highlight style="--highlight: lightgreen" tooltip="Add one">+1</button>
    <button step="10" highlight style="--highlight: lightblue" tooltip="Add ten">+10</button>
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
    <p highlight style="--highlight: lavender" tooltip="Updated every second">{{ time() }}</p>
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
