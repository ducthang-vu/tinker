import { Left, Right, type Either } from "@tinker/functional";
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
//
// Aliases stand for a list of modifiers, written once here: `plain` is a click
// with no modifier key held, `submit` is Enter without Shift, and `modified`
// needs at least one of Ctrl, Shift, Alt or Meta held (its complement is `plain`).
//
// `primary` and `secondary` pick the mouse button: 0 (the left button) and 2 (the
// right button) of a `MouseEvent`. A keyboard event has no button, so it never passes.

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

/** A guard that passes when at least one of Ctrl, Shift, Alt or Meta is held. */
export type AnyModifier = "modified";

/** The mouse button of a `MouseEvent`: `primary` is the left one, `secondary` the right. */
export type ButtonModifier = "primary" | "secondary";

const BUTTONS: Readonly<Record<ButtonModifier, number>> = {
  primary: 0,
  secondary: 2,
};

/** The modifiers Tinker supports. */
export type EventModifier = "prevent" | "stop" | "self" | "once"
  | SystemModifier | NegatedSystemModifier | AnyModifier | ButtonModifier | KeyModifier;

/** A name standing for several modifiers, expanded when the event name is parsed. */
export type AliasName = "plain" | "submit";

const ALIASES: Readonly<Record<AliasName, readonly EventModifier[]>> = {
  plain: ["!ctrl", "!shift", "!alt", "!meta"],
  submit: ["enter", "!shift"],
};

type SystemFlag = "ctrlKey" | "shiftKey" | "altKey" | "metaKey";

const SYSTEM_NAMES: readonly string[] = Object.keys(SYSTEM_KEYS);

const SUPPORTED: readonly string[] = [
  "prevent",
  "stop",
  "self",
  "once",
  ...Object.keys(SYSTEM_KEYS),
  "modified",
  ...Object.keys(BUTTONS),
  ...Object.keys(ALIASES),
  ...Object.keys(KEY_VALUES),
];

/** The `MouseEvent.button` a button modifier stands for, if `modifier` is one. */
export function buttonOf(modifier: EventModifier): number | undefined {
  return (BUTTONS as Partial<Record<string, number>>)[modifier];
}

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

/** Whether a mouse or keyboard event has Ctrl, Shift, Alt or Meta held. */
export function anySystemKeyHeld(event: KeyboardEvent): boolean {
  return (["ctrlKey", "shiftKey", "altKey", "metaKey"] as const)
    .some((flag) => event[flag] === true);
}

/** A DOM event name with its modifiers, in the order written. */
export interface EventName {
  /** The DOM event, e.g. `"click"`. */
  readonly event: string;
  readonly modifiers: readonly EventModifier[];
}

export function isModifier(name: string): name is EventModifier | AliasName {
  return SUPPORTED.includes(name)
    || (name.startsWith("!") && SYSTEM_NAMES.includes(name.slice(1)));
}

/** The modifiers a name stands for: an alias its list, any other modifier itself. */
export function expandModifier(name: EventModifier | AliasName): readonly EventModifier[] {
  return Object.hasOwn(ALIASES, name) ? ALIASES[name as AliasName] : [name as EventModifier];
}

/**
 * Parse `click.self.prevent` into the event and its modifiers, or fail
 * naming what is wrong. `what` names where it is written, for the message.
 */
export function parseEventName(source: string, what: string): Either<EventName, Error> {
  const [event = "", ...names] = source.split(".");
  if (event === "") {
    return Left.of(new Error(`Missing event name in ${what} "${source}"`));
  }
  const unknown = names.find((name) => !isModifier(name));
  if (unknown !== undefined) {
    return Left.of(new Error(
      `Unknown modifier ".${unknown}" in ${what} "${source}": `
      + `supported are ${SUPPORTED.map((name) => `.${name}`)
        .join(", ")}`,
    ));
  }
  return Right.of({
    event,
    modifiers: names.filter(isModifier)
      .flatMap(expandModifier),
  });
}
