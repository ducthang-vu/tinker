import { expect, test } from "vitest";
import { matchRoute } from "./match.ts";

const TODOS = { path: "/todos", component: class {} };
const TODO = { path: "/todos/:id", component: class {} };

test("a route matches the same path, with no params", () => {
  expect(matchRoute([TODOS], "/todos"))
    .toEqual({ route: TODOS, params: {} });
});

test("a param takes one segment, and its name is the key", () => {
  expect(matchRoute([TODO], "/todos/7"))
    .toEqual({ route: TODO, params: { id: "7" } });
});

test("the query and the hash are not part of the path", () => {
  expect(matchRoute([TODO], "/todos/7?tab=done#top"))
    .toEqual({ route: TODO, params: { id: "7" } });
});

test("empty segments are ignored, so a trailing slash matches", () => {
  expect(matchRoute([TODOS], "/todos/"))
    .toEqual({ route: TODOS, params: {} });
});

test("the root path matches the root route", () => {
  const root = { path: "/", component: class {} };
  expect(matchRoute([root], "/"))
    .toEqual({ route: root, params: {} });
});

test("a different number of segments does not match", () => {
  expect(matchRoute([TODO], "/todos"))
    .toBeUndefined();
  expect(matchRoute([TODOS], "/todos/7"))
    .toBeUndefined();
});

test("a literal segment must be the same", () => {
  expect(matchRoute([TODOS], "/users"))
    .toBeUndefined();
});

test("the first route that matches wins", () => {
  const first = { path: "/todos/new", component: class {} };
  expect(matchRoute([first, TODO], "/todos/new"))
    .toEqual({ route: first, params: {} });
});
