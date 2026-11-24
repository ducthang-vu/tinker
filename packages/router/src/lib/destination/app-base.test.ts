import { describe, expect, test } from "vitest";
import { getOrThrow, isNone, isSome, type Maybe } from "@tinker/functional";
import { UrlBuilder } from "./url-builder.ts";
import { fromBrowserUrl, toBrowserUrl } from "./app-base.ts";

const tree = [{ path: "/todos", children: [{ path: "/:id" }] }, { path: "/home" }] as const;
const todo = UrlBuilder.for(tree)
  .withSegment("todos")
  .withParam("id", "7")
  .withQuery("tab", "done")
  .withFragment("top")
  .build();

/** The value of a Some, or the test fails. */
function valueOf(maybe: Maybe<string>): string {
  if (!isSome(maybe)) {
    throw new Error("expected Some");
  }
  return getOrThrow(maybe, () => new Error("expected Some"));
}

describe("toBrowserUrl", () => {
  test("adds the base in front of the app-relative URL", () => {
    expect(toBrowserUrl(todo, "/app"))
      .toBe("/app/todos/7?tab=done#top");
  });

  test("with no base, the URL is unchanged", () => {
    expect(toBrowserUrl(todo, ""))
      .toBe("/todos/7?tab=done#top");
  });

  test("a trailing slash on the base is not doubled", () => {
    expect(toBrowserUrl(todo, "/app/"))
      .toBe("/app/todos/7?tab=done#top");
  });
});

describe("fromBrowserUrl", () => {
  test("takes the base off a URL under it", () => {
    expect(valueOf(fromBrowserUrl("/app/todos/7", "/app")))
      .toBe("/todos/7");
  });

  test("the base alone is the root", () => {
    expect(valueOf(fromBrowserUrl("/app", "/app")))
      .toBe("/");
  });

  test("a URL outside the base is None", () => {
    expect(isNone(fromBrowserUrl("/other/todos", "/app")))
      .toBe(true);
  });

  test("a URL that only starts with the same letters is outside the base", () => {
    expect(isNone(fromBrowserUrl("/application", "/app")))
      .toBe(true);
  });

  test("with no base, every URL is under the app", () => {
    expect(valueOf(fromBrowserUrl("/todos/7", "")))
      .toBe("/todos/7");
  });

  test("a base with a trailing slash matches the same URLs", () => {
    expect(valueOf(fromBrowserUrl("/app/home", "/app/")))
      .toBe("/home");
  });

  test("a browser URL round-trips through the base", () => {
    const browser = toBrowserUrl(todo, "/app");
    expect(valueOf(fromBrowserUrl(browser, "/app")))
      .toBe("/todos/7?tab=done#top");
  });
});
