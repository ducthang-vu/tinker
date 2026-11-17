// Event modifiers: what a DOM event listener does around its handler.
//
//   (click.self.prevent)="go()"      in a template
//   "(click.self.prevent)": "go()"   in a host option
//
// Guards come first: `self` ignores an event whose target is a child of the
// element, and a key modifier ignores a keyboard event whose `key` is another one
// (`(keydown.enter)`, `(keydown.esc)`). Then the actions: `prevent` and `stop` change
// the event (they can come in any order). `once` counts only events that passed the
// guards, and ends the listener after the first of them.

import { Either, type EitherError } from "@tinker/functional";

/** The keys a keyboard event can be filtered to, by name. */
const KEY_VALUES = {
  enter: "Enter",
  esc: "Escape",
  escape: "Escape",
  space: " ",
  tab: "Tab",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
} as const;

export type KeyModifier = keyof typeof KEY_VALUES;

/** The modifiers Tinker supports. */
export type EventModifier = "prevent" | "stop" | "self" | "once" | KeyModifier;

const SUPPORTED: readonly string[] = ["prevent", "stop", "self", "once", ...Object.keys(KEY_VALUES)];

/** The `KeyboardEvent.key` a key modifier stands for, if `modifier` is one. */
export function keyOf(modifier: EventModifier): string | undefined {
  return (KEY_VALUES as Partial<Record<string, string>>)[modifier];
}

/** A DOM event name with its modifiers, in the order written. */
export interface EventName {
  /** The DOM event, e.g. `"click"`. */
  readonly event: string;
  readonly modifiers: readonly EventModifier[];
}

export function isModifier(name: string): name is EventModifier {
  return SUPPORTED.includes(name);
}

/**
 * Parse `click.self.prevent` into the event and its modifiers, or fail
 * naming what is wrong. `what` names where it is written, for the message.
 */
export function parseEventName(source: string, what: string): EitherError<EventName> {
  const [event = "", ...names] = source.split(".");
  if (event === "") {
    return Either.left(new Error(`Missing event name in ${what} "${source}"`));
  }
  const unknown = names.find((name) => !isModifier(name));
  if (unknown !== undefined) {
    return Either.left(new Error(
      `Unknown modifier ".${unknown}" in ${what} "${source}": `
      + `supported are ${SUPPORTED.map((name) => `.${name}`)
        .join(", ")}`,
    ));
  }
  return Either.right({ event, modifiers: names.filter(isModifier) });
}
