// What the factories need from the view that owns what they create: where to
// register elements and inputs, and what to run when the view is destroyed.
// A component's View is one, and so is an EmbeddedView (a block's branch).

import type { InputBinding } from "../authoring/input.ts";
import type { ElementContext } from "./element-context.ts";

export interface ViewLike {
  /** Run `callback` when the view is destroyed (right away if it already is). */
  addDestroyCallback(callback: () => void): void;
  /** Record the inputs of a directive in this view's template. */
  addInputs(directive: object, inputs: ReadonlyMap<string, InputBinding<unknown>>): void;
  /** Record the context of an element declared in this view's template. */
  addElement(context: ElementContext): void;
  /** Destroy the view, and everything it owns. Calling it again does nothing. */
  destroy(): void;
}
