import { describe, expect, test } from "vitest";
import { basedPlatformLocation, toAppPath, toBrowserPath } from "./base-location.ts";

describe("toAppPath", () => {
  test("strips the base, keeping the query and the hash", () => {
    expect(toAppPath("/tinker/", "/tinker/api?x=1#top"))
      .toBe("/api?x=1#top");
  });

  test("the base itself is the root", () => {
    expect(toAppPath("/tinker/", "/tinker/"))
      .toBe("/");
    expect(toAppPath("/tinker/", "/tinker"))
      .toBe("/");
  });

  test("a URL outside the base is left as it is", () => {
    expect(toAppPath("/tinker/", "/other"))
      .toBe("/other");
  });

  test("with the root as base, the path is unchanged", () => {
    expect(toAppPath("/", "/api"))
      .toBe("/api");
    expect(toAppPath("/", "/"))
      .toBe("/");
  });
});

describe("toBrowserPath", () => {
  test("adds the base in front of the app's path", () => {
    expect(toBrowserPath("/tinker/", "/api"))
      .toBe("/tinker/api");
    expect(toBrowserPath("/tinker/", "/"))
      .toBe("/tinker/");
  });

  test("with the root as base, the path is unchanged", () => {
    expect(toBrowserPath("/", "/api"))
      .toBe("/api");
  });
});

describe("basedPlatformLocation", () => {
  test("reads the app's path and writes the browser's", () => {
    window.history.replaceState(null, "", "/tinker/api?x=1");
    const location = basedPlatformLocation("/tinker/");
    expect(location.url())
      .toBe("/api?x=1");

    location.push("/todos", null);
    expect(window.location.pathname)
      .toBe("/tinker/todos");

    location.replace("/", null);
    expect(window.location.pathname)
      .toBe("/tinker/");
  });
});
