import { describe, expect, test } from "vitest";
import { Right } from "@tinker/functional";
import { messageOf } from "./test-support.ts";

describe("messageOf", () => {
  test("gives the message of a failure, and \"no error\" for a success", () => {
    expect(messageOf(Right.of(1)))
      .toBe("no error");
  });
});
