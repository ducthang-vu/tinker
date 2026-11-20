// Event modifiers: what a DOM event listener does around its handler.
//
//   (click.self.prevent)="go()"      in a template
//   "(click.self.prevent)": "go()"   in a host option
//
// Guards come first: `self` ignores an event whose target is a child of the
// element, a key modifier ignores a keyboard event whose `key` is another one
// (`(keydown.enter)`, `(keydown.esc)`), and a system modifier ignores an event
// without that key held (`(click.ctrl)`, `(click.cmd)`), and `!` in front of a
// system modifier requires the key not to be held (`(click.!ctrl)`). Other keys
// may be held too, so `(click.ctrl)` also fires with Shift held. Then the actions:
// `prevent` and `stop` change the event (they can come in any order). `once`
// counts only events that passed the guards, and ends the listener after the
// first of them.

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

/** The modifier keys a mouse or keyboard event can require, by name. */
const SYSTEM_KEYS = {
  ctrl: "ctrlKey",
  shift: "shiftKey",
  alt: "altKey",
  meta: "metaKey",
  /** Cmd on macOS; the same key as `meta`. */
  cmd: "metaKey",
} as const;

export type SystemModifier = keyof typeof SYSTEM_KEYS;

/** A system modifier with `!` in front: the key must not be held. */
export type NegatedSystemModifier = `!${SystemModifier}`;

/** The modifiers Tinker supports. */
export type EventModifier = "prevent" | "stop" | "self" | "once"
  | SystemModifier | NegatedSystemModifier | KeyModifier;

type SystemFlag = "ctrlKey" | "shiftKey" | "altKey" | "metaKey";

const SYSTEM_NAMES: readonly string[] = Object.keys(SYSTEM_KEYS);

const SUPPORTED: readonly string[] = [
  "prevent",
  "stop",
  "self",
  "once",
  ...Object.keys(SYSTEM_KEYS),
  ...Object.keys(KEY_VALUES),
];

/** The `KeyboardEvent.key` a key modifier stands for, if `modifier` is one. */
export function keyOf(modifier: EventModifier): string | undefined {
  return (KEY_VALUES as Partial<Record<string, string>>)[modifier];
}

/** What a system modifier checks: its event flag, and whether the key must be held. */
export interface SystemRequirement {
  readonly flag: SystemFlag;
  readonly held: boolean;
}

/** The requirement of a system modifier (`ctrl` or `!ctrl`), if `modifier` is one. */
export function systemRequirementOf(modifier: EventModifier): SystemRequirement | undefined {
  const negated = modifier.startsWith("!");
  const name = negated ? modifier.slice(1) : modifier;
  const flag = (SYSTEM_KEYS as Partial<Record<string, SystemFlag>>)[name];
  return flag === undefined ? undefined : { flag, held: !negated };
}

/** A DOM event name with its modifiers, in the order written. */
export interface EventName {
  /** The DOM event, e.g. `"click"`. */
  readonly event: string;
  readonly modifiers: readonly EventModifier[];
}

export function isModifier(name: string): name is EventModifier {
  return SUPPORTED.includes(name)
    || (name.startsWith("!") && SYSTEM_NAMES.includes(name.slice(1)));
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
