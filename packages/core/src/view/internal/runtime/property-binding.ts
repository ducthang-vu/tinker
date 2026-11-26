// A property binding: one DOM property of one element, e.g. `[value]="draft()"` on an
// `<input>` or `[textContent]="label()"` on a `<p>`. It sets the property, not an attribute,
// as Angular does: the attribute keeps what the template wrote. The value goes through the
// sanitizer first (sanitization.ts), so `[innerHTML]` and a `[href]` to `javascript:` are
// not set. The view's watch calls `update()`; the property is written only when the value
// changed.

import { None, Some, isSome, filter } from "@tinker/functional";
import type { Renderer } from "../renderer.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Expression } from "../template/expression.ts";
import type { Scope } from "../template/scope.ts";
import { propertyValue } from "./sanitization.ts";

export class PropertyBinding {
  private last = None.of<unknown>();

  /**
   * @param element The element whose property is set.
   * @param name The property, as the DOM names it (`textContent`, not `textcontent`).
   * @param expression Gives its value.
   * @param context What the expression reads its names from.
   * @param renderer Sets the property.
   */
  constructor(
    private readonly element: Element,
    private readonly name: string,
    private readonly expression: Expression,
    private readonly context: Scope,
    private readonly renderer: Renderer,
  ) {}

  /** Evaluate the expression, and set the property if the value changed. */
  update(): void {
    const value = propertyValue(this.name, evaluate(this.expression, this.context));
    if (isSome(filter(this.last, (last) => Object.is(last, value)))) {
      return;
    }
    this.last = Some.of(value);
    this.renderer.setProperty(this.element, this.name, value);
  }
}
