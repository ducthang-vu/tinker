// A `@let` declaration: sets its template variable to the value of its
// expression, before the bindings after it read it. Re-evaluated on each run
// of the view's watch, like any binding, so it follows the signals it reads.

import type { Expression } from "../template/expression.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Scope } from "../template/scope.ts";
import type { Binding } from "./text-binding.ts";

export class LetBinding implements Binding {
  /** @param scope Where the value is stored, for the bindings that read it. */
  constructor(
    private readonly name: string,
    private readonly expression: Expression,
    private readonly scope: Scope,
  ) {}

  /** Evaluate the expression, and store the value under the name. */
  update(): void {
    this.scope.lets.set(this.name, evaluate(this.expression, this.scope));
  }
}
