import { expect, test } from "vitest";
import { UrlBuilder } from "./url-builder.ts";

test("a builder of a URL without changes builds the same URL", () => {
  expect(UrlBuilder.from("/todos/7")
    .build())
    .toBe("/todos/7");
});

test("query params are added, and replace the same key of the URL's own query", () => {
  expect(UrlBuilder.from("/todos?tab=open&page=1")
    .withQuery({ tab: "done", sort: "date" })
    .build())
    .toBe("/todos?tab=done&page=1&sort=date");
});

test("a fragment replaces the hash", () => {
  expect(UrlBuilder.from("/todos#old")
    .withFragment("top")
    .build())
    .toBe("/todos#top");
});

test("an empty fragment removes the hash", () => {
  expect(UrlBuilder.from("/todos#old")
    .withFragment("")
    .build())
    .toBe("/todos");
});

test("without a fragment, the URL's own hash is kept after its query", () => {
  expect(UrlBuilder.from("/todos?tab=open#old")
    .withQuery({ page: "2" })
    .withFragment(undefined)
    .build())
    .toBe("/todos?tab=open&page=2#old");
});

test("the path is the URL's path, without its query and hash", () => {
  expect(UrlBuilder.from("/todos/7?tab=done#top").path)
    .toBe("/todos/7");
  expect(UrlBuilder.from("/todos").path)
    .toBe("/todos");
});

test("each step returns a new builder, so a builder can be shared", () => {
  const base = UrlBuilder.from("/todos");
  const done = base.withQuery({ tab: "done" });
  expect(base.build())
    .toBe("/todos");
  expect(done.build())
    .toBe("/todos?tab=done");
});

test("segments are joined into a path, and the query and hash go in the last one", () => {
  expect(UrlBuilder.segments(["todos", "7"])
    .withQuery({ tab: "done" })
    .build())
    .toBe("todos/7?tab=done");
});
