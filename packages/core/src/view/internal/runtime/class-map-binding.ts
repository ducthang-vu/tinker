// A class map binding: `[class]="{ done: todo.done }"` on an element. Each name of the
// object is a class, on while its value is truthy. The view's watch calls `update()`,
// and the DOM is written only for the classes that changed.

import type { Renderer } from "../renderer.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Expression } from "../template/expression.ts";
import type { Scope } from "../template/scope.ts";

export class ClassMapBinding {
  private on = new Set<string>();

  /**
   * @param element The element whose classes are set.
   * @param expression The object: its truthy keys are the classes on.
   * @param context What the expression reads its names from.
   * @param renderer Adds and removes the classes.
   */
  constructor(
    private readonly element: Element,
    private readonly expression: Expression,
    private readonly context: Scope,
    private readonly renderer: Renderer,
  ) {}

  update(): void {
    const value = evaluate(this.expression, this.context);
    const next = new Set(value === null || typeof value !== "object"
      ? []
      : Object.keys(value)
          .filter((name) => Boolean((value as Record<string, unknown>)[name])));
    for (const name of this.on) {
      if (!next.has(name)) {
        this.renderer.removeClass(this.element, name);
      }
    }
    for (const name of next) {
      if (!this.on.has(name)) {
        this.renderer.addClass(this.element, name);
      }
    }
    this.on = next;
  }
}
