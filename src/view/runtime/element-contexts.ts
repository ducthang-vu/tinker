// Which ElementContext (directives and component) belongs to which element.
// Shared by the component factory (which attaches components) and the
// engine (which answers "what is on this element?").

import { Injectable } from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";
import { ElementContext } from "./element-context.ts";

@Injectable()
export class ElementContexts {
  /** Weak, so removed elements can be garbage-collected. */
  private readonly contexts = new WeakMap<Element, ElementContext>();

  /** What is on `element`, if anything. */
  get(element: Element): Maybe<ElementContext> {
    return Maybe.fromNullable(this.contexts.get(element));
  }

  /** The context of `element`, created (and remembered) if it has none yet. */
  getOrCreate(element: Element): ElementContext {
    return this.get(element).match({
      some: (context) => context,
      none: () => this.remember(new ElementContext(element)),
    });
  }

  private remember(context: ElementContext): ElementContext {
    this.contexts.set(context.element, context);
    return context;
  }

  /** Stop tracking `context` once nothing is left on its element. */
  forgetIfEmpty(context: ElementContext): void {
    if (context.isEmpty) {
      this.contexts.delete(context.element);
    }
  }
}
