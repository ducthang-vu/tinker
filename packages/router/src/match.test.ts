import { expect, test } from "vitest";
import { matchRoute } from "./match.ts";
import type { Route } from "./route.ts";

class Page {}

/** A route with no children. */
const leaf = (path: string): Route => ({ path, component: Page });

/** A route whose children match the segments after its path. */
const branch = (path: string, children: readonly Route[]): Route => ({
  path,
  component: Page,
  children,
});

const TODOS = leaf("/todos");
const TODO = leaf("/todos/:id");

test("a leaf route matches its path exactly, with no params", () => {
  expect(matchRoute(branch("", [TODOS]), "/todos"))
    .toEqual({ route: TODOS, params: {} });
});

test("a param takes one segment, and its name is the key", () => {
  expect(matchRoute(branch("", [TODO]), "/todos/7"))
    .toEqual({ route: TODO, params: { id: "7" } });
});

test("the query and the hash are not part of the path", () => {
  expect(matchRoute(branch("", [TODO]), "/todos/7?tab=done#top"))
    .toEqual({ route: TODO, params: { id: "7" } });
});

test("empty segments are ignored, so a trailing slash matches", () => {
  expect(matchRoute(branch("", [TODOS]), "/todos/"))
    .toEqual({ route: TODOS, params: {} });
});

test("the root alone matches the root URL", () => {
  const root = leaf("");
  expect(matchRoute(root, "/"))
    .toEqual({ route: root, params: {} });
});

test("a leaf does not match a URL with more segments", () => {
  expect(matchRoute(branch("", [TODOS]), "/todos/7"))
    .toBeUndefined();
});

test("a literal segment must be the same", () => {
  expect(matchRoute(branch("", [TODOS]), "/users"))
    .toBeUndefined();
});

test("the first child that matches wins, and a child that fails gives way to the next", () => {
  expect(matchRoute(branch("", [TODOS, TODO]), "/todos/7"))
    .toEqual({ route: TODO, params: { id: "7" } });
});

test("** matches any URL, when it comes last", () => {
  const notFound = { path: "**", component: Page };
  const root = branch("", [TODOS, notFound]);
  expect(matchRoute(root, "/anything/at/all"))
    .toEqual({ route: notFound, params: {} });
  expect(matchRoute(root, "/todos"))
    .toEqual({ route: TODOS, params: {} });
});

test("a route with children consumes its path, and its child matches the rest", () => {
  const users = leaf("users/:id");
  const admin = branch("/admin", [leaf("users"), users]);
  expect(matchRoute(branch("", [admin]), "/admin/users/7"))
    .toEqual({ route: users, params: { id: "7" } });
});

test("a route with children does not match when no child matches the rest", () => {
  const admin = branch("/admin", [leaf("users")]);
  expect(matchRoute(branch("", [admin]), "/admin"))
    .toBeUndefined();
});

test("params of the routes above are inherited by the child", () => {
  const team = leaf("teams/:team");
  const org = branch("/orgs/:org", [team]);
  expect(matchRoute(branch("", [org]), "/orgs/acme/teams/core"))
    .toEqual({ route: team, params: { org: "acme", team: "core" } });
});

test("an empty child matches the URL of its parent", () => {
  const index = leaf("");
  const admin = branch("/admin", [index, leaf("users")]);
  expect(matchRoute(branch("", [admin]), "/admin"))
    .toEqual({ route: index, params: {} });
});
