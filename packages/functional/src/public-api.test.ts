import { expect, test } from "vitest";
import * as api from "./public-api.ts";

test("exports exactly the public runtime symbols", () => {
  expect(Object.keys(api)
    .sort())
    .toEqual(["Either", "Emitter", "Maybe", "Stream", "Task", "TimeoutError"]);
});

test("exports the EitherError type", () => {
  const value: import("./public-api.ts").EitherError<number> = api.Either.right(1);
  expect(value.getOrThrow())
    .toBe(1);
});
