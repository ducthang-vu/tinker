// A style binding: one inline style property of one element, e.g.
// `[style.color]="item().color"` in a template, or
// `host: { "[style.opacity]": "opacity()" }` on a directive. An empty value
// (null, undefined, "" or false) removes the property. The view's watch
// calls `update()`; the DOM is written only when the value changed.

import { Maybe } from "../../functional/index.ts";
import type { Renderer } from "../renderer.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Expression } from "../template/expression.ts";

export class StyleBinding {
  private last = Maybe.none<string | undefined>();

  /**
   * @param element The element whose style is set.
   * @param name The style property, in CSS spelling: `background-color`, or a
   *   custom property `--highlight`.
   * @param expression Gives its value.
   * @param context What the expression reads its names from.
   * @param renderer Sets and removes the property.
   */
  constructor(
    private readonly element: Element,
    readonly name: string,
    private readonly expression: Expression,
    private readonly context: object,
    private readonly renderer: Renderer,
  ) {}

  /** The precedence key: a template binding on the element replaces a host binding with it. */
  get key(): string {
    return `style:${this.name}`;
  }

  /** Evaluate the expression, and set or remove the property if that changed. */
  update(): void {
    const value = evaluate(this.expression, this.context);
    const text = value === null || value === undefined || value === false || value === ""
      ? undefined
      : String(value);
    if (this.last.filter((last) => last === text)
      .isSome()) {
      return;
    }
    this.last = Maybe.some(text);
    // Style is only meaningful on elements with a style object (HTML and SVG
    // elements both have one, in this renderer's world; others are not supported).
    const element = this.element as HTMLElement;
    if (text === undefined) {
      this.renderer.removeStyle(element, this.name);
    } else {
      this.renderer.setStyle(element, this.name, text);
    }
  }
}
