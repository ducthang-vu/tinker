import { expect, test } from "vitest";
import { pathPartOf, withParts } from "./url-parts.ts";

test("without query params or a fragment, the URL is unchanged", () => {
  expect(withParts("/todos/7", undefined, undefined))
    .toBe("/todos/7");
});

test("query params are added, and replace the same key of the URL's own query", () => {
  expect(withParts("/todos?tab=open&page=1", { tab: "done", sort: "date" }, undefined))
    .toBe("/todos?tab=done&page=1&sort=date");
});

test("a fragment replaces the hash", () => {
  expect(withParts("/todos#old", undefined, "top"))
    .toBe("/todos#top");
});

test("an empty fragment removes the hash", () => {
  expect(withParts("/todos#old", undefined, ""))
    .toBe("/todos");
});

test("without a fragment, the URL's own hash is kept after its query", () => {
  expect(withParts("/todos?tab=open#old", { page: "2" }, undefined))
    .toBe("/todos?tab=open&page=2#old");
});

test("the path of a URL, without its query and hash", () => {
  expect(pathPartOf("/todos/7?tab=done#top"))
    .toBe("/todos/7");
  expect(pathPartOf("/todos"))
    .toBe("/todos");
});
