// An input binder: `[label]="item().name"` in a template. It evaluates an
// expression against the component whose template it is in (the parent),
// and sets the inputs of that name of the directives and component on the
// element (the children). The view's watch calls `update()`; the inputs
// are set only when the value changed.

import { Maybe } from "../../../functional/index.ts";
import type { InputBinding } from "../authoring/input.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Expression } from "../template/expression.ts";
import type { Scope } from "../template/scope.ts";

export class InputBinder {
  private last = Maybe.none<unknown>();

  /**
   * @param targets The inputs it sets.
   * @param expression Gives their value.
   * @param context What the expression reads its names from: the parent component.
   */
  constructor(
    private readonly targets: readonly InputBinding<unknown>[],
    private readonly expression: Expression,
    private readonly context: Scope,
  ) {}

  /** Evaluate the expression, and set the inputs if the value changed. */
  update(): void {
    const value = evaluate(this.expression, this.context);
    if (this.last.filter((last) => Object.is(last, value))
      .isSome()) {
      return;
    }
    this.last = Maybe.some(value);
    for (const target of this.targets) {
      target.bind(value);
    }
  }
}
