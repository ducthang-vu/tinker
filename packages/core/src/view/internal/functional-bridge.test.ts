import { describe, expect, test } from "vitest";
import { Either as LegacyEither, Maybe as LegacyMaybe } from "@tinker/functional";
import { Left, Right, None, Some } from "@tinker/functional/v1";
import {
  eitherFromLegacy,
  eitherToLegacy,
  maybeFromLegacy,
  maybeToLegacy,
} from "./functional-bridge.ts";

/** Values a Maybe or an Either may hold: normal ones and the edge cases. */
const values: readonly unknown[] = [0, -0, NaN, "", null, undefined, [], {}, false, "text"];

describe("Maybe across the bridge", () => {
  test("a v0 Some becomes a v1 Some, with the same value, for every edge value", () => {
    for (const value of values) {
      const converted = maybeFromLegacy(LegacyMaybe.some(value));
      expect(converted)
        .toEqual(Some.of(value));
    }
  });

  test("a v0 None becomes a v1 None", () => {
    expect(maybeFromLegacy(LegacyMaybe.none()))
      .toEqual(None.of());
  });

  test("a v1 Some becomes a v0 Some, and a v1 None a v0 None", () => {
    for (const value of values) {
      expect(maybeToLegacy(Some.of(value))
        .match({ some: (inner) => inner, none: () => "none" }))
        .toBe(value);
    }
    expect(maybeToLegacy(None.of())
      .match({ some: () => "some", none: () => "none" }))
      .toBe("none");
  });
});

describe("Either across the bridge", () => {
  test("a v0 Right and Left become v1 Right and Left, for every edge value", () => {
    for (const value of values) {
      expect(eitherFromLegacy(LegacyEither.right(value)))
        .toEqual(Right.of(value));
      expect(eitherFromLegacy(LegacyEither.left(value)))
        .toEqual(Left.of(value));
    }
  });

  test("a v1 Right and Left become v0 Right and Left", () => {
    expect(eitherToLegacy(Right.of(1))
      .match({ right: (value) => value, left: () => -1 }))
      .toBe(1);
    expect(eitherToLegacy(Left.of("bad"))
      .match({ right: () => "ok", left: (error) => error }))
      .toBe("bad");
  });
});
