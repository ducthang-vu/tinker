import { nested } from "../destination/test-builder.ts";
import { expect, test } from "vitest";
import { } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { shownAfter } from "./next-route-with-component.ts";
import { Some, None, isNone, getOrThrow } from "@tinker/functional";

class Page {}
const ROUTE = { path: "", component: Page };

test("shownAfter skips routes with no component, and is None when none follows", () => {
  const home = new ActivatedRoute({ path: "home", component: Page }, {}, [], None.of());
  const group = new ActivatedRoute(nested({ path: "group" }, []), {}, [], None.of());
  const detail = new ActivatedRoute({ path: ":id", component: Page }, {}, [], None.of());
  expect(shownAfter([home, group, detail], home))
    .toEqual(Some.of(detail));
  expect(shownAfter([home, group], group))
    .toEqual(None.of());
  expect(shownAfter([home], detail))
    .toEqual(None.of());
});
