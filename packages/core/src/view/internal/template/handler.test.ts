import { describe, expect, test } from "vitest";
import { parseHandler } from "./handler.ts";

describe("parseHandler", () => {
  test("accepts method() and method($event), with spaces", () => {
    expect(parseHandler("pick()", "event handler")
      .getOrThrow())
      .toEqual({ method: "pick", passEvent: false });
    expect(parseHandler(" pick( $event ) ", "event handler")
      .getOrThrow())
      .toEqual({ method: "pick", passEvent: true });
  });

  test("rejects anything else, naming what it was", () => {
    for (const source of ["pick", "pick(1)", "a.b()", "pick($event, 1)", "x = 1"]) {
      expect(parseHandler(source, "event handler")
        .match({
          left: (error) => error.message,
          right: () => "accepted",
        }))
        .toBe(`Unsupported event handler "${source}": write "method()" or "method($event)"`);
    }
  });
});
