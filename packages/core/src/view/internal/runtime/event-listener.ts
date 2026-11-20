// Listen to a DOM event with its modifiers (see template/event-modifiers.ts).
// Used by template event bindings and by host listeners, so both behave alike.

import type { Renderer } from "../renderer.ts";
import {
  anySystemKeyHeld,
  buttonOf,
  type EventModifier,
  type EventName,
  keyOf,
  type SystemRequirement,
  systemRequirementOf,
} from "../template/event-modifiers.ts";

/**
 * Listen to `name` on `target`. For each event: `self` ignores it unless its
 * target is `target` itself; a key or system modifier ignores it unless its key
 * matches (or is held); `prevent` and `stop` change it; `once` ends the
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
  const keys = modifiers.map(keyOf)
    .filter((key): key is string => key !== undefined);
  const buttons = modifiers.map(buttonOf)
    .filter((button): button is number => button !== undefined);
  const systems = modifiers.map(systemRequirementOf)
    .filter((requirement): requirement is SystemRequirement => requirement !== undefined);
  const stop = renderer.listen(target, event, (domEvent) => {
    if (has("self") && domEvent.target !== target) {
      return;
    }
    if (keys.length > 0 && !keys.includes((domEvent as KeyboardEvent).key)) {
      return;
    }
    if (buttons.length > 0 && !buttons.includes((domEvent as MouseEvent).button)) {
      return;
    }
    if (has("modified") && !anySystemKeyHeld(domEvent as KeyboardEvent)) {
      return;
    }
    if (systems.some(({ flag, held }) => ((domEvent as KeyboardEvent)[flag] === true) !== held)) {
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
