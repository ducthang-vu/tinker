// Directives on any element: [highlight] toggles a class with a host class
// binding, and [tooltip] sets the native title with a host attribute binding,
// from an input set by a plain attribute.

import { signal } from "../../src/signals/index.ts";
import { Directive, input } from "../../src/view/index.ts";

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
export class Highlight {
  readonly hovered = signal(false);

  enter(): void {
    this.hovered.set(true);
  }

  leave(): void {
    this.hovered.set(false);
  }
}

/** Shows its text as the element's native tooltip: a host attribute binding. */
@Directive({
  selector: "[tooltip]",
  host: { "[attr.title]": "tooltip()" },
})
export class Tooltip {
  /** From the `tooltip` attribute itself. */
  private readonly tooltip = input<string>();
}
