// Which ElementContext (directives and component) belongs to which element.
// Shared by the component factory (which attaches components) and the
// engine (which answers "what is on this element?").

import { Injectable } from "../di/index.ts";
import { ElementContext } from "./element-context.ts";

@Injectable()
export class ElementContexts {
  /** Weak, so removed elements can be garbage-collected. */
  private readonly contexts = new WeakMap<Element, ElementContext>();

  /** What is on `element`, or `undefined` if nothing. */
  get(element: Element): ElementContext | undefined {
    return this.contexts.get(element);
  }

  /** The context of `element`, created (and remembered) if it has none yet. */
  getOrCreate(element: Element): ElementContext {
    let context = this.contexts.get(element);
    if (!context) {
      context = new ElementContext(element);
      this.contexts.set(element, context);
    }
    return context;
  }

  /** Stop tracking `context` once nothing is left on its element. */
  forgetIfEmpty(context: ElementContext): void {
    if (context.isEmpty) {
      this.contexts.delete(context.element);
    }
  }
}
