import { expect, test } from "vitest";
import { hrefOf } from "./href.ts";

test("an absolute string is the href as it is", () => {
  expect(hrefOf("/todos?tab=done#top", ["todos", "7"]))
    .toBe("/todos?tab=done#top");
});

test("a relative string is resolved against the base path", () => {
  expect(hrefOf("edit", ["todos", "7"]))
    .toBe("/todos/7/edit");
});

test("an array is the segments of a path, resolved against the base path", () => {
  expect(hrefOf(["..", "8"], ["todos", "7"]))
    .toBe("/todos/8");
});

test("nothing to link to gives no href", () => {
  expect(hrefOf(undefined, ["todos"]))
    .toBeUndefined();
});
