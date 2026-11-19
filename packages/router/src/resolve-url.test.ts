import { expect, test } from "vitest";
import { resolveUrl } from "./resolve-url.ts";

test("an absolute URL ignores the base", () => {
  expect(resolveUrl("/todos/7", ["orgs", "acme"]))
    .toBe("/todos/7");
});

test("a relative URL is appended to the base", () => {
  expect(resolveUrl("teams/x", ["orgs", "acme"]))
    .toBe("/orgs/acme/teams/x");
});

test("'..' goes up one segment, and never above the root", () => {
  expect(resolveUrl("../y", ["orgs", "acme", "teams", "x"]))
    .toBe("/orgs/acme/teams/y");
  expect(resolveUrl("../../../../y", ["orgs"]))
    .toBe("/y");
});

test("'.' stays where it is", () => {
  expect(resolveUrl("./teams", ["orgs"]))
    .toBe("/orgs/teams");
});

test("the query and the hash are kept", () => {
  expect(resolveUrl("teams?tab=done#top", ["orgs"]))
    .toBe("/orgs/teams?tab=done#top");
  expect(resolveUrl("?tab=done", ["orgs"]))
    .toBe("/orgs?tab=done");
});

test("empty segments are ignored", () => {
  expect(resolveUrl("/todos/", []))
    .toBe("/todos");
  expect(resolveUrl("/", []))
    .toBe("/");
});
