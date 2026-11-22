// An attribute binding: one attribute of one element, e.g.
// `[attr.title]="item().label"` in a template, or
// `host: { "[attr.role]": "role()" }` on a directive. `true` sets the
// attribute with an empty value; `null`, `undefined` and `false` remove it.
// The view's watch calls `update()`; the DOM is written only when the
// result changed.

import type { Renderer } from "../renderer.ts";
import { evaluate } from "../template/evaluate.ts";
import { attributeText } from "./sanitization.ts";
import type { Expression } from "../template/expression.ts";
import type { Scope } from "../template/scope.ts";
import { Some, None, isSome, filter } from "@tinker/functional";

export class AttributeBinding {
  private last = None.of<string | undefined>();

  /**
   * @param element The element whose attribute is set.
   * @param name The attribute, as written in the DOM (kebab-case: the browser's
   *   parser lowercases template attribute names).
   * @param expression Gives its value.
   * @param context What the expression reads its names from.
   * @param renderer Sets and removes the attribute.
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
    return `attr:${this.name}`;
  }

  /** Evaluate the expression, and set or remove the attribute if that changed. */
  update(): void {
    // A value the attribute may not hold is not set: see sanitization.ts.
    const text = attributeText(this.name, evaluate(this.expression, this.context));
    if (isSome(filter(this.last, (last) => last === text))) {
      return;
    }
    this.last = Some.of(text);
    if (text === undefined) {
      this.renderer.removeAttribute(this.element, this.name);
    } else {
      this.renderer.setAttribute(this.element, this.name, text);
    }
  }
}
