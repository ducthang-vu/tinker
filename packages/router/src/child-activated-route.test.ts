import { expect, test } from "vitest";
import { } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { nextAfter } from "./child-activated-route.ts";
import { Some, None, isNone, getOrThrow } from "@tinker/functional/v1";

class Page {}
const ROUTE = { path: "", component: Page };

test("nextAfter is the entry after the given route, and None for the last or an unknown one", () => {
  const root = new ActivatedRoute(ROUTE, {}, [], None.of());
  const child = new ActivatedRoute(ROUTE, {}, ["todos"], Some.of(root));
  const list = [root, child];
  expect(getOrThrow(nextAfter(list, root), () => new Error("none")))
    .toBe(child);
  expect(isNone(nextAfter(list, child)))
    .toBe(true);
  const stranger = new ActivatedRoute(ROUTE, {}, [], None.of());
  expect(isNone(nextAfter(list, stranger)))
    .toBe(true);
});
