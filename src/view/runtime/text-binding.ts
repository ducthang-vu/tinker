// A text binding: one DOM text node showing an interpolation, e.g.
// `Count: {{ count() }}`. The view's watch calls `update()`; the DOM is
// written only when the resulting text changed.

import { inject, Injectable } from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";
import type { Renderer } from "../renderer.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Expression } from "../template/expression.ts";
import type { Interpolation } from "../template/interpolation.ts";
import { inputsNamed } from "../authoring/input.ts";
import { AttributeBinding } from "./attribute-binding.ts";
import { ClassBinding } from "./class-binding.ts";
import { InputBinder } from "./input-binder.ts";
import { StyleBinding } from "./style-binding.ts";
import { RENDERER } from "../tokens.ts";

/**
 * Creates the bindings of templates, with the app's renderer. One method
 * per kind of binding: today `{{ }}` texts, later `[prop]` bindings.
 */
/** Something the view's watch keeps up to date: it calls `update()` on each run. */
export interface Binding {
  update(): void;
  /** What a template binding on the same element replaces (e.g. `class:done`), if anything. */
  readonly key?: string;
}

@Injectable()
export class BindingFactory {
  private readonly renderer = inject(RENDERER);

  /** A binding showing `interpolation`, evaluated against `component`, in `node`. */
  text(node: Text, interpolation: Interpolation, component: object): TextBinding {
    return new TextBinding(node, interpolation, component, this.renderer);
  }

  /**
   * A binding setting the inputs named `name` of `instances` (the directives
   * and component on element `<elementName>`) to `expression`, read from
   * `context`. Throws if none of them has such an input.
   */
  inputs(
    name: string,
    expression: Expression,
    context: object,
    instances: readonly object[],
    elementName: string,
  ): InputBinder {
    const targets = inputsNamed(instances, name);
    if (targets.length === 0) {
      throw new Error(
        `[${name}] on <${elementName}>: no directive or component on this element has an input "${name}"`,
      );
    }
    return new InputBinder(targets, expression, context);
  }

  /**
   * A binding turning class `name` of `element` on while `expression`,
   * read from `context`, is truthy.
   */
  classToggle(
    element: Element,
    name: string,
    expression: Expression,
    context: object,
  ): ClassBinding {
    return new ClassBinding(element, name, expression, context, this.renderer);
  }

  /** A binding setting the inline style property `name` of `element` to `expression`'s value. */
  style(element: Element, name: string, expression: Expression, context: object): StyleBinding {
    return new StyleBinding(element, name, expression, context, this.renderer);
  }

  /** A binding setting the attribute `name` of `element` to `expression`'s value. */
  attribute(
    element: Element,
    name: string,
    expression: Expression,
    context: object,
  ): AttributeBinding {
    return new AttributeBinding(element, name, expression, context, this.renderer);
  }
}

export class TextBinding {
  private last = Maybe.none<string>();

  constructor(
    private readonly node: Text,
    private readonly interpolation: Interpolation,
    private readonly component: object,
    private readonly renderer: Renderer,
  ) {}

  /** Evaluate the expressions, and update the text node if the text changed. */
  update(): void {
    const { strings, expressions } = this.interpolation;
    const text = expressions.reduce(
      (result, expression, i) =>
        result + toText(evaluate(expression, this.component)) + strings[i + 1],
      strings[0]!,
    );
    if (this.last.filter((last) => last === text)
      .isNone()) {
      this.renderer.setText(this.node, text);
      this.last = Maybe.some(text);
    }
  }
}

/** How a value is shown: `null` and `undefined` as nothing, anything else as a string. */
function toText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
