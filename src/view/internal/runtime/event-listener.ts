// Listen to a DOM event with its modifiers (see template/event-modifiers.ts).
// Used by template event bindings and by host listeners, so both behave alike.

import type { Renderer } from "../renderer.ts";
import type { EventModifier, EventName } from "../template/event-modifiers.ts";

/**
 * Listen to `name` on `target`. For each event: `self` ignores it unless its
 * target is `target` itself; `prevent` and `stop` change it; `once` ends the
 * listener once an event has passed the guards; then `handler` runs.
 * Returns how to remove the listener.
 */
export function listenWithModifiers(
  renderer: Renderer,
  target: EventTarget,
  { event, modifiers }: EventName,
  handler: (event: Event) => void,
): () => void {
  const has = (modifier: EventModifier) => modifiers.includes(modifier);
  const stop = renderer.listen(target, event, (domEvent) => {
    if (has("self") && domEvent.target !== target) {
      return;
    }
    if (has("prevent")) {
      domEvent.preventDefault();
    }
    if (has("stop")) {
      domEvent.stopPropagation();
    }
    if (has("once")) {
      stop();
    }
    handler(domEvent);
  });
  return stop;
}
