// A text binding: one DOM text node showing an interpolation, e.g.
// `Count: {{ count() }}`. The view's watch calls `update()`; the DOM is
// written only when the resulting text changed.

import { inject, Injectable } from "../../../di/index.ts";
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
import type { Scope } from "../template/scope.ts";
import { Some, None, isNone, filter } from "@tinker/functional";

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

  /** A binding showing `interpolation`, evaluated in `scope`, in `node`. */
  text(node: Text, interpolation: Interpolation, scope: Scope): TextBinding {
    return new TextBinding(node, interpolation, scope, this.renderer);
  }

  /**
   * A binding setting the inputs named `name` of `instances` (the directives
   * and component on element `<elementName>`) to `expression`, read from
   * `context`. Throws if none of them has such an input.
   */
  inputs(
    name: string,
    expression: Expression,
    context: Scope,
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
    context: Scope,
  ): ClassBinding {
    return new ClassBinding(element, name, expression, context, this.renderer);
  }

  /** A binding setting the inline style property `name` of `element` to `expression`'s value. */
  style(element: Element, name: string, expression: Expression, context: Scope): StyleBinding {
    return new StyleBinding(element, name, expression, context, this.renderer);
  }

  /** A binding setting the attribute `name` of `element` to `expression`'s value. */
  attribute(
    element: Element,
    name: string,
    expression: Expression,
    context: Scope,
  ): AttributeBinding {
    return new AttributeBinding(element, name, expression, context, this.renderer);
  }
}

export class TextBinding {
  private last = None.of<string>();

  constructor(
    private readonly node: Text,
    private readonly interpolation: Interpolation,
    private readonly scope: Scope,
    private readonly renderer: Renderer,
  ) {}

  /** Evaluate the expressions, and update the text node if the text changed. */
  update(): void {
    this.show(this.text());
  }

  /**
   * The text the expressions give now. This is the only part that reads signals, so a
   * watch that runs it records exactly the reads that matter.
   */
  text(): string {
    const { strings, expressions } = this.interpolation;
    return expressions.reduce(
      (result, expression, i) =>
        result + toText(evaluate(expression, this.scope)) + strings[i + 1],
      strings[0]!,
    );
  }

  /** Write `text` to the text node, if it differs from the last one written. Reads no signals. */
  show(text: string): void {
    if (isNone(filter(this.last, (last) => last === text))) {
      this.renderer.setText(this.node, text);
      this.last = Some.of(text);
    }
  }
}

/** How a value is shown: `null` and `undefined` as nothing, anything else as a string. */
function toText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
