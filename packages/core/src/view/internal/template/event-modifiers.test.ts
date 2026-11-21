import { describe, expect, test } from "vitest";
import { Either } from "@tinker/functional";
import { parseEventName } from "./event-modifiers.ts";

const messageOf = (result: Either<unknown, Error>) => result.match({
  left: (error) => error.message,
  right: () => "no error",
});

describe("parseEventName", () => {
  test("a plain event has no modifiers", () => {
    expect(parseEventName("click", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "click", modifiers: [] });
  });

  test("keeps the modifiers in the order written", () => {
    expect(parseEventName("click.self.prevent.stop.once", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "click", modifiers: ["self", "prevent", "stop", "once"] });
  });

  test("ctrl, shift, alt, meta and cmd are modifiers", () => {
    expect(parseEventName("click.ctrl.shift.alt.meta.cmd", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "click", modifiers: ["ctrl", "shift", "alt", "meta", "cmd"] });
  });

  test("a ! in front of a system modifier is a modifier; ! in front of anything else is not", () => {
    expect(parseEventName("click.!ctrl.!cmd", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "click", modifiers: ["!ctrl", "!cmd"] });
    expect(messageOf(parseEventName("click.!enter", "x")))
      .toContain(`Unknown modifier ".!enter"`);
    expect(messageOf(parseEventName("click.!toString", "x")))
      .toContain(`Unknown modifier ".!toString"`);
  });

  test("plain and submit expand to their modifiers, in place", () => {
    expect(parseEventName("click.plain.prevent", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "click", modifiers: ["!ctrl", "!shift", "!alt", "!meta", "prevent"] });
    expect(parseEventName("keydown.submit", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "keydown", modifiers: ["enter", "!shift"] });
  });

  test("primary and secondary are modifiers", () => {
    expect(parseEventName("mousedown.secondary.prevent", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "mousedown", modifiers: ["secondary", "prevent"] });
  });

  test("modified stays a guard", () => {
    expect(parseEventName("click.modified", "x")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ event: "click", modifiers: ["modified"] });
  });

  test("an unknown modifier is an error naming it and the supported ones", () => {
    const message = messageOf(parseEventName("click.prevnt", "event binding"));
    expect(message)
      .toBe(`Unknown modifier ".prevnt" in event binding "click.prevnt": supported are .prevent, .stop, .self, .once, .ctrl, .shift, .alt, .meta, .cmd, .modified, .primary, .secondary, .plain, .submit, .enter, .esc, .escape, .space, .tab, .up, .down, .left, .right`);
  });

  test("a missing event name is an error", () => {
    expect(messageOf(parseEventName(".prevent", "host listener")))
      .toBe(`Missing event name in host listener ".prevent"`);
    expect(messageOf(parseEventName("", "event binding")))
      .toBe(`Missing event name in event binding ""`);
  });
});
