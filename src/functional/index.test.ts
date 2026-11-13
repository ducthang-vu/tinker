import { expect, test } from "vitest";
import * as api from "./index.ts";

test("exports exactly the public runtime symbols", () => {
  expect(Object.keys(api)
    .sort())
    .toEqual(["Either", "Maybe", "Task", "TimeoutError"]);
});

test("exports the EitherError type", () => {
  const value: import("./index.ts").EitherError<number> = api.Either.right(1);
  expect(value.getOrThrow())
    .toBe(1);
});
