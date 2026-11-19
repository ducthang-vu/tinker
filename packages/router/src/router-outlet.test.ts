import { expect, test } from "vitest";
import { getDirectiveMetadata } from "@tinker/core";
import { RouterOutlet } from "./router-outlet.ts";

test("RouterOutlet is a directive for the router-outlet element", () => {
  const metadata = getDirectiveMetadata(RouterOutlet)
    .getOrThrow(() => new Error("not a directive"));
  expect(metadata.selector)
    .toBe("router-outlet");
});
