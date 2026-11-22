// A class binding: one class on one element, on while an expression is
// truthy, e.g. `[class.done]="todo.done()"` in a template, or
// `host: { "[class.open]": "isOpen()" }` on a directive. The view's watch
// calls `update()`; the DOM is written only when the result changed.

import type { Renderer } from "../renderer.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Expression } from "../template/expression.ts";
import type { Scope } from "../template/scope.ts";
import { Some, None, isNone, filter } from "@tinker/functional/v1";

export class ClassBinding {
  private last = None.of<boolean>();

  /**
   * @param element The element whose class is toggled.
   * @param name The class.
   * @param expression Turns the class on while truthy.
   * @param context What the expression reads its names from: the component
   *   for a template binding, the directive for a host binding.
   * @param renderer Adds and removes the class.
   */
  constructor(
    private readonly element: Element,
    readonly name: string,
    private readonly expression: Expression,
    private readonly context: Scope,
    private readonly renderer: Renderer,
  ) {}

  /** The precedence key: a template binding on the element replaces a host binding with it. */
  get key(): string {
    return `class:${this.name}`;
  }

  /** Evaluate the expression, and add or remove the class if that changed. */
  update(): void {
    const on = Boolean(evaluate(this.expression, this.context));
    if (isNone(filter(this.last, (last) => last === on))) {
      if (on) {
        this.renderer.addClass(this.element, this.name);
      } else {
        this.renderer.removeClass(this.element, this.name);
      }
      this.last = Some.of(on);
    }
  }
}
