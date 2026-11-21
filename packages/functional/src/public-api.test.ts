import { expect, test } from "vitest";
import * as api from "./public-api.ts";

test("exports exactly the public runtime symbols", () => {
  expect(Object.keys(api)
    .sort())
    .toEqual(["Either", "Emitter", "Maybe", "Stream", "Task", "TimeoutError", "partial", "pipe", "toError"]);
});

test("an Either is a Right or a Left, and matching it gives the value", () => {
  const value: import("./public-api.ts").Either<number, Error> = api.Either.right(1);
  expect(value.match({
    left: (error) => {
      throw error;
    },
    right: (value) => value,
  }))
    .toBe(1);
});
