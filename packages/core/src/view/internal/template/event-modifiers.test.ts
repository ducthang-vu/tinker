import { describe, expect, test } from "vitest";
import { type EitherError } from "@tinker/functional";
import { parseEventName } from "./event-modifiers.ts";

const messageOf = (result: EitherError<unknown>) => result.match({
  left: (error) => error.message,
  right: () => "no error",
});

describe("parseEventName", () => {
  test("a plain event has no modifiers", () => {
    expect(parseEventName("click", "x")
      .getOrThrow())
      .toEqual({ event: "click", modifiers: [] });
  });

  test("keeps the modifiers in the order written", () => {
    expect(parseEventName("click.self.prevent.stop.once", "x")
      .getOrThrow())
      .toEqual({ event: "click", modifiers: ["self", "prevent", "stop", "once"] });
  });

  test("ctrl, shift, alt, meta and cmd are modifiers", () => {
    expect(parseEventName("click.ctrl.shift.alt.meta.cmd", "x")
      .getOrThrow())
      .toEqual({ event: "click", modifiers: ["ctrl", "shift", "alt", "meta", "cmd"] });
  });

  test("an unknown modifier is an error naming it and the supported ones", () => {
    const message = messageOf(parseEventName("click.prevnt", "event binding"));
    expect(message)
      .toBe(`Unknown modifier ".prevnt" in event binding "click.prevnt": supported are .prevent, .stop, .self, .once, .ctrl, .shift, .alt, .meta, .cmd, .enter, .esc, .escape, .space, .tab, .up, .down, .left, .right`);
  });

  test("a missing event name is an error", () => {
    expect(messageOf(parseEventName(".prevent", "host listener")))
      .toBe(`Missing event name in host listener ".prevent"`);
    expect(messageOf(parseEventName("", "event binding")))
      .toBe(`Missing event name in event binding ""`);
  });
});
