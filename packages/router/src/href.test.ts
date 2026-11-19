import { expect, test } from "vitest";
import { hrefOf } from "./href.ts";

test("a string is the href as it is", () => {
  expect(hrefOf("/todos?tab=done#top"))
    .toBe("/todos?tab=done#top");
});

test("an array is the segments of the path, joined", () => {
  expect(hrefOf(["todos", "7"]))
    .toBe("/todos/7");
});

test("each segment is encoded, so a slash in it stays one segment", () => {
  expect(hrefOf(["notes", "a/b c"]))
    .toBe("/notes/a%2Fb%20c");
});

test("an empty array is the root", () => {
  expect(hrefOf([]))
    .toBe("/");
});

test("nothing to link to gives no href", () => {
  expect(hrefOf(undefined))
    .toBeUndefined();
});
