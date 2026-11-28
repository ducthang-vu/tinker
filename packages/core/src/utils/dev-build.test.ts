import { afterEach, expect, test } from "vitest";
import { isDevBuild } from "./dev-build.ts";

const dev = globalThis as { __TINKER_DEV__?: boolean };

afterEach(() => {
  delete dev.__TINKER_DEV__;
});

test("a development build is one whose __TINKER_DEV__ is true", () => {
  expect(isDevBuild())
    .toBe(false);
  dev.__TINKER_DEV__ = true;
  expect(isDevBuild())
    .toBe(true);
});
