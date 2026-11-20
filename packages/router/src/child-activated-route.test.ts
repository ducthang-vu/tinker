import { expect, test } from "vitest";
import { Maybe } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { nextAfter } from "./child-activated-route.ts";

class Page {}
const ROUTE = { path: "", component: Page };

test("nextAfter is the entry after the given route, and None for the last or an unknown one", () => {
  const root = new ActivatedRoute(ROUTE, {}, [], Maybe.none());
  const child = new ActivatedRoute(ROUTE, {}, ["todos"], Maybe.some(root));
  const list = [root, child];
  expect(nextAfter(list, root)
    .getOrThrow(() => new Error("none")))
    .toBe(child);
  expect(nextAfter(list, child)
    .isNone())
    .toBe(true);
  const stranger = new ActivatedRoute(ROUTE, {}, [], Maybe.none());
  expect(nextAfter(list, stranger)
    .isNone())
    .toBe(true);
});
