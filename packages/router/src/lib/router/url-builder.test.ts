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

test("a path given as segments is joined, and the query and hash go in the last one", () => {
  expect(UrlBuilder.from(["todos", "7"])
    .withQuery({ tab: "done" })
    .build())
    .toBe("todos/7?tab=done");
});

/** The URL `url` resolved against `base`. */
const resolved = (url: string, base: readonly string[]): string =>
  UrlBuilder.from(url)
    .resolve(base)
    .build();

test("an absolute URL ignores the base", () => {
  expect(resolved("/todos/7", ["orgs", "acme"]))
    .toBe("/todos/7");
});

test("a relative URL is appended to the base", () => {
  expect(resolved("teams/x", ["orgs", "acme"]))
    .toBe("/orgs/acme/teams/x");
});

test("'..' goes up one segment, and never above the root", () => {
  expect(resolved("../y", ["orgs", "acme", "teams", "x"]))
    .toBe("/orgs/acme/teams/y");
  expect(resolved("../../../../y", ["orgs"]))
    .toBe("/y");
});

test("'.' stays where it is", () => {
  expect(resolved("./teams", ["orgs"]))
    .toBe("/orgs/teams");
});

test("the query and the hash are kept", () => {
  expect(resolved("teams?tab=done#top", ["orgs"]))
    .toBe("/orgs/teams?tab=done#top");
  expect(resolved("?tab=done", ["orgs"]))
    .toBe("/orgs?tab=done");
});

test("empty segments are ignored", () => {
  expect(resolved("/todos/", []))
    .toBe("/todos");
  expect(resolved("/", []))
    .toBe("/");
});

test("the segments of the path are its non-empty parts", () => {
  expect(UrlBuilder.from("/todos/7?tab=done#top").segments)
    .toEqual(["todos", "7"]);
  expect(UrlBuilder.from("/").segments)
    .toEqual([]);
  expect(UrlBuilder.from(["todos", "7"]).segments)
    .toEqual(["todos", "7"]);
});
