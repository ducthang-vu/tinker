// The app path builder: the one place an AppPath is made. It starts at the root of the route
// tree, and every step returns a new builder, so a builder can be kept and extended. Each step
// checks its segments against the routes, so a segment no route takes throws on that line, for
// static and dynamic routes alike. `relativeTo()` with no argument starts at the route the builder
// was provided in. `build()` ends the chain with an AppPath.

import { inject, Injectable, Injector, runInInjectionContext } from "@tinker/core";
import { match } from "@tinker/functional";
import { loadedChildrenOf } from "../router/lazy-children.ts";
import { levelsOf } from "../router/match.ts";
import { Router } from "../router/router.ts";
import type { Route } from "../router/route.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import { type AppPath, makeAppPath, type Segment } from "./app-path.ts";
import {
  decodeOrThrow,
  ParseError,
  parseQuery,
  segmentOf,
  segmentsFor,
  splitOnce,
  splitSlashes,
} from "./app-path-parse.ts";

export { ParseError } from "./app-path-parse.ts";

/** One level of a position: the route it is at, and the segments that level writes. */
interface Level {
  /** The route of the level. */
  readonly route: Route;
  /** The segments the level writes: none for a route that takes no segment. */
  readonly segments: readonly Segment[];
}

@Injectable()
/**
 * A position in the route tree, with the segments written so far. It injects the router and the
 * activated route of the component it is in: `relativeTo()` with no argument starts there. Every
 * step returns a new builder, and `build` ends the chain with an AppPath. Provide it in a
 * component's `providers`, or inject it from the root.
 */
export class AppPathBuilder {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly activated = inject(ActivatedRoute);

  /**
   * The builder at a position. Injected, it is the root of the router's tree.
   *
   * @param levels The levels from the root down to the current route. None means the root.
   * @param query The query written so far.
   * @param fragment The fragment, if one is set.
   */
  constructor(
    private readonly levels: readonly Level[] = [],
    private readonly query: Readonly<Record<string, string>> = {},
    private readonly fragment: string | undefined = undefined,
  ) {}

  /**
   * A builder at a position, made in the injection context of this builder, so its own injected
   * dependencies resolve.
   *
   * @param levels The levels of the new position.
   * @param query The query of the new position.
   * @param fragment The fragment of the new position.
   * @returns The new builder.
   */
  private next(
    levels: readonly Level[],
    query: Readonly<Record<string, string>>,
    fragment: string | undefined,
  ): AppPathBuilder {
    return runInInjectionContext(this.injector, () => new AppPathBuilder(levels, query, fragment));
  }

  /**
   * Adds segments below the current position. One string is split on `/`; several are taken as
   * they are. Throws when no route takes the segments.
   *
   * @param segments The segments, in order.
   * @returns A builder at the end of the segments.
   * @throws ParseError when no route takes the segments.
   */
  to(...segments: string[]): AppPathBuilder {
    this.assertPathPhase();
    const parts = segments.length === 1 ? splitSlashes(segments[0] as string) : segments;
    return this.next(this.extended(parts, segments.join("/"), false), {}, undefined);
  }

  /**
   * Continues from this position with a raw URL. A URL that starts with `/` is read from the root;
   * any other is read from this position. A relative URL is written at the last level that wrote a
   * segment, so a list page under its parent is reached from that parent. Each segment is matched
   * as
   * the router matches. The query and the fragment of the URL are added to the ones written so far.
   *
   * @param raw The raw URL, such as `"/todos/7?tab=done#top"` or `"7"`.
   * @returns A builder at the end of the URL.
   * @throws ParseError when the URL is not one of the tree's routes, or a part is malformed.
   */
  parse(raw: string): AppPathBuilder {
    this.assertPathPhase();
    const [beforeFragment, fragmentRaw] = splitOnce(raw, "#");
    const [pathRaw, queryRaw] = splitOnce(beforeFragment, "?");
    const parts = splitSlashes(pathRaw)
      .map((segment) => decodeOrThrow(raw, segment));
    const levels = this.extended(parts, raw, raw.startsWith("/"));
    const fragment = fragmentRaw === undefined ? undefined : decodeOrThrow(raw, fragmentRaw);
    return this.next(levels, parseQuery(raw, queryRaw), fragment);
  }

  /**
   * Moves to the parent route. Throws at the root.
   *
   * @returns A builder at the parent.
   * @throws Error at the root, which has no parent, or when the path was already left.
   */
  up(): AppPathBuilder {
    this.assertPathPhase();
    if (this.levels.length === 0) {
      throw new Error("up: already at the root");
    }
    return this.next(this.levels.slice(0, -1), {}, undefined);
  }

  /**
   * Starts at an activated route, with the segments it was reached by. With no argument, it is the
   * activated route the builder was provided in. A builder injected at the root has the root route
   * as that route, so its `relativeTo()` starts at the root: provide the builder in a component to
   * start at the component's route.
   *
   * @param route The activated route to start at, if not the builder's own.
   * @returns A builder at that route.
   * @throws Error when the path was already left for the query or the fragment.
   */
  relativeTo(route?: ActivatedRoute): AppPathBuilder {
    this.assertPathPhase();
    const target = route ?? this.activated;
    // The first activated route is the root, which has no level of its own.
    const levels = ancestryOf(target)
      .slice(1)
      .map((level) => ({
        route: level.route,
        segments: segmentsFor(level.route, level.segments),
      }));
    return this.next(levels, {}, undefined);
  }

  /**
   * Adds query pairs. Allowed after the path and before the fragment, and any number of times; a
   * pair with the same name as an earlier one replaces it.
   *
   * @param query The pairs to add, by name.
   * @returns A builder with the pairs added.
   * @throws Error when the fragment is already set, since the query comes before it.
   */
  withQuery(query: Readonly<Record<string, string>>): AppPathBuilder {
    if (this.fragment !== undefined) {
      throw new Error("withQuery: the fragment comes last");
    }
    const merged = { ...this.query, ...query };
    return this.next(this.levels, merged, this.fragment);
  }

  /**
   * Sets the fragment. It comes last, so nothing can follow it but `build`.
   *
   * @param value The fragment, without its `#`. It is percent-encoded.
   * @returns A builder with the fragment set.
   * @throws Error when the fragment is already set.
   */
  withFragment(value: string): AppPathBuilder {
    if (this.fragment !== undefined) {
      throw new Error("withFragment: the fragment is already set");
    }
    return this.next(this.levels, this.query, value);
  }

  /**
   * The app path the chain has written: the segments, the query, and the fragment. It throws when
   * no route takes the whole path, so a path that stops short of a route cannot be built.
   *
   * @returns The AppPath, which is plain data.
   * @throws ParseError when no route takes the whole path.
   */
  build(): AppPath {
    const segments = this.levels.flatMap((level) => level.segments);
    const values = segments.map((segment) => segment.value);
    if (levelsOf(this.router.routes(), values) === undefined) {
      const path = makeAppPath(segments, this.query, this.fragment);
      throw new ParseError("no-route", path.format(), values[values.length - 1] ?? "");
    }
    return makeAppPath(segments, this.query, this.fragment);
  }

  /**
   * The levels after this position that `parts` take, one child at a time. A segment is taken by a
   * literal child, else by a param child, else by a `**` child. The builder checks that each
   * segment
   * is taken; whether the whole URL reaches a route is decided when it is matched.
   *
   * @param parts The segments to take.
   * @param input The input, for errors.
   * @param absolute Whether the segments are read from the root rather than from this position.
   * @returns The levels of this position followed by the new ones.
   * @throws ParseError when a segment is taken by no child.
   */
  private extended(parts: readonly string[], input: string, absolute: boolean): readonly Level[] {
    const prefix = absolute ? [] : this.levels.slice(0, this.writtenEnd());
    let node = prefix.length === 0
      ? this.router.routes()
      : (prefix[prefix.length - 1] as Level).route;
    const taken: Level[] = [];
    let index = 0;
    while (index < parts.length) {
      const part = parts[index] as string;
      const path = takenBy(node, part);
      if (path === undefined) {
        // A lazy route whose children are not loaded yet takes the rest as written: the navigation
        // that loads the children checks it. The segments are written by that route's level.
        if (isUnloadedLazy(node)) {
          return withUnchecked([...prefix, ...taken], parts.slice(index));
        }
        throw new ParseError("no-route", input, part);
      }
      // The empty-path routes on the way write no segment: they share the URL of their child.
      const child = path[path.length - 1] as Route;
      for (const empty of path.slice(0, -1)) {
        taken.push({ route: empty, segments: [] });
      }
      // A `**` route takes the rest of the URL in one level. An empty-path route takes the empty
      // part but writes no segment, so it shares the URL of its parent.
      const name = segmentOf(child.path);
      const values = name === "**" ? parts.slice(index) : [part];
      taken.push({ route: child, segments: name === "" ? [] : segmentsFor(child, values) });
      node = child;
      index += values.length;
    }
    return [...prefix, ...taken];
  }

  /**
   * The number of levels up to and including the last one that wrote a segment: a route that takes
   * none shares its parent's URL, so a relative URL is written from that parent.
   *
   * @returns The number of levels up to the last one that wrote a segment.
   */
  private writtenEnd(): number {
    return this.levels.reduce(
      (end, level, index) => (level.segments.length > 0 ? index + 1 : end),
      0,
    );
  }

  /**
   * Throws when the path has already been left for the query or the fragment.
   *
   * @throws Error when the path has already been left for the query or the fragment.
   */
  private assertPathPhase(): void {
    if (Object.keys(this.query).length > 0 || this.fragment !== undefined) {
      throw new Error("the path comes before the query and the fragment");
    }
  }
}

/**
 * The activated routes from the root down to `route`, root first.
 *
 * @param route The activated route to end at.
 * @returns The activated routes, root first, ending with the route.
 */
function ancestryOf(route: ActivatedRoute): readonly ActivatedRoute[] {
  const above = match(route.parent, {
    Some: (parent) => ancestryOf(parent),
    None: () => [],
  });
  return [...above, route];
}

/**
 * Whether a route is lazy and its children are not loaded yet, so the router cannot check the
 * segments below it.
 *
 * @param route The route to check.
 * @returns True when the route loads its children and has not loaded them.
 */
function isUnloadedLazy(route: Route): boolean {
  return route.children === undefined
    && route.loadChildren !== undefined
    && loadedChildrenOf(route) === undefined;
}

/**
 * The levels with `values` written after the last one, as plain segments: the last level is the
 * lazy route the values lie under.
 *
 * @param levels The levels, with the lazy route last.
 * @param values The values to write, unchecked.
 * @returns The levels, the last one with the values added.
 */
function withUnchecked(levels: readonly Level[], values: readonly string[]): readonly Level[] {
  const last = levels[levels.length - 1] as Level;
  const written = values.map((value): Segment => ({ kind: "segment", value }));
  return [...levels.slice(0, -1), { ...last, segments: [...last.segments, ...written] }];
}

/**
 * The children of a route: its own, or, for a lazy route, the loaded ones.
 *
 * @param node The route.
 * @returns The children, or none.
 */
function childrenOf(node: Route): readonly Route[] {
  return node.children ?? loadedChildrenOf(node) ?? [];
}

/**
 * The routes that take a segment, from `node` down: the child that takes it, after the empty-path
 * routes on the way. A child takes a segment as a literal child first, then a param child, then a
 * `**` child; an empty-path child passes the segment on to its own children.
 *
 * @param node The route whose children are searched.
 * @param segment The segment to take.
 * @returns The routes on the way, the last one taking the segment, or undefined when none does.
 */
function takenBy(node: Route, segment: string): readonly Route[] | undefined {
  const children = childrenOf(node);
  const named = children.filter((child) => segmentOf(child.path) !== "");
  const literal = children.find((child) => segmentOf(child.path) === segment);
  const param = named.find((child) => segmentOf(child.path)
    .startsWith(":"));
  const rest = named.find((child) => segmentOf(child.path) === "**");
  const direct = literal ?? param ?? rest;
  if (direct !== undefined) {
    return [direct];
  }
  for (const child of children) {
    if (segmentOf(child.path) === "") {
      const below = takenBy(child, segment);
      if (below !== undefined) {
        return [child, ...below];
      }
    }
  }
  return undefined;
}
