// The URL builder: the one place a destination is made. It is injected, and it reads the router's
// route tree when each step runs, so a segment no route takes fails on that line, for static and
// dynamic routes alike. `relativeTo()` starts at the route a component is shown in. A `Path` is an
// immutable position in the tree: each step returns a new one, so a path can be kept and extended.

import { Injectable, inject } from "@tinker/core";
import { match } from "@tinker/functional";
import { Router } from "../router/router.ts";
import { type LevelMatch, levelsOf } from "../router/match.ts";
import type { Route } from "../router/route.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import { Destination, type Part } from "./destination.ts";

/** A URL that could not be parsed into a destination of the route tree. */
export class ParseError extends Error {
  /**
   * A parse error: its reason, the raw input, and the part that failed.
   *
   * @param reason Why the URL is not one of the tree's.
   * @param input The raw URL.
   * @param at The part that failed.
   */
  constructor(
    readonly reason: "no-route" | "malformed",
    /** The raw input. */
    readonly input: string,
    /** The part that failed: the segment, the query pair, or the fragment. */
    readonly at: string,
  ) {
    super(`cannot parse "${input}": ${reason} at "${at}"`);
    this.name = "ParseError";
  }
}

/** One level of a position: the route it is at, and the parts that level writes. */
export interface Level {
  /** The route of the level. */
  readonly route: Route;
  /** The parts the level writes: none for a route that takes no segment. */
  readonly parts: readonly Part[];
}

/**
 * An immutable position in the route tree, with the parts written so far. Each step returns a new
 * position. A step that no child of the current route takes throws, and a parse that no route
 * matches throws a ParseError.
 */
export class Path {
  /**
   * Only `at` and `rootOf` make one.
   *
   * @param levels The levels from the root down to the current route.
   * @param query The query pairs written so far.
   * @param fragment The fragment, if one is set.
   */
  private constructor(
    private readonly levels: readonly Level[],
    private readonly query: readonly (readonly [string, string])[],
    private readonly fragment: string | undefined,
  ) {}

  /**
   * A position at the end of `levels`, with nothing written after them.
   *
   * @param levels The levels from the root down to the current route.
   * @returns The position.
   */
  static at(levels: readonly Level[]): Path {
    return new Path(levels, [], undefined);
  }

  /**
   * A position at the root of `routes`, for a tree that is not the router's. The root consumes no
   * segment, and its children are `routes`.
   *
   * @param routes The top-level routes.
   * @returns A position at the root.
   */
  static rootOf(routes: readonly Route[]): Path {
    return Path.at([{ route: { path: "", children: routes }, parts: [] }]);
  }

  /**
   * Moves to a child with a literal segment. Throws when no such child exists.
   *
   * @param segment The child's path without its leading slash.
   * @returns A position at that child.
   * @throws Error when no such child exists under the current route, or the path was already left.
   */
  withSegment(segment: string): Path {
    this.assertPathPhase();
    const child = childNamed(this.current(), segment, false);
    // The empty segment is a route that takes none: its page is the page of this one.
    return this.push(child, segment === "" ? [] : [{ kind: "segment", value: segment }]);
  }

  /**
   * Moves to a child with a param, and gives the param its value. Throws when no such param exists.
   *
   * @param name The param's name, as declared with a colon in the path.
   * @param value The value of the param, in the URL. It is percent-encoded when formatted.
   * @returns A position at that child.
   * @throws Error when no such param exists under the current route, or the path was already left.
   */
  withParam(name: string, value: string): Path {
    this.assertPathPhase();
    return this.push(childNamed(this.current(), name, true), [{ kind: "param", name, value }]);
  }

  /**
   * Moves back to the parent route. Throws at the root.
   *
   * @returns A position at the parent.
   * @throws Error at the root, which has no parent, or when the path was already left.
   */
  up(): Path {
    this.assertPathPhase();
    if (this.levels.length === 1) {
      throw new Error("up: already at the root");
    }
    return new Path(this.levels.slice(0, -1), this.query, this.fragment);
  }

  /**
   * Adds a query pair. Allowed after the path and before the fragment, and any number of times.
   *
   * @param name The query name.
   * @param value The query value. It is percent-encoded.
   * @returns A position with the pair added.
   * @throws Error when the fragment is already set, since the query comes before it.
   */
  withQuery(name: string, value: string): Path {
    if (this.fragment !== undefined) {
      throw new Error("withQuery: the fragment comes last");
    }
    return new Path(this.levels, [...this.query, [name, value]], this.fragment);
  }

  /**
   * Sets the fragment. It comes last, so nothing can follow it.
   *
   * @param value The fragment, without its `#`. It is percent-encoded.
   * @returns A position with the fragment set.
   * @throws Error when the fragment is already set.
   */
  withFragment(value: string): Path {
    if (this.fragment !== undefined) {
      throw new Error("withFragment: the fragment is already set");
    }
    return new Path(this.levels, this.query, value);
  }

  /**
   * Continues from this position with a raw URL. A URL that starts with `/` is read from the root;
   * any other is read from this position. Each segment is matched as the router matches, so a
   * segment that no route takes throws a ParseError. The query and the fragment of the URL are
   * added to the ones written so far.
   *
   * @param raw The raw URL, such as `"/todos/7?tab=done#top"` or `"7"`.
   * @returns A position at the end of the URL.
   * @throws ParseError when the URL is not one of the tree's routes, or a part is malformed.
   */
  parse(raw: string): Path {
    this.assertPathPhase();
    const [beforeFragment, fragmentRaw] = splitOnce(raw, "#");
    const [pathRaw, queryRaw] = splitOnce(beforeFragment, "?");
    const segments = pathRaw.split("/")
      .filter((segment) => segment !== "")
      .map((segment) => decodeOrThrow(raw, segment));
    // A relative URL is written at the last level that wrote a segment: a route that takes none
    // (`""`) shares the URL of its parent, so its children are reached from that parent.
    const written = this.levels
      .reduce((last, level, index) => (level.parts.length > 0 ? index : last), 0);
    const base = raw.startsWith("/") ? this.levels.slice(0, 1) : this.levels.slice(0, written + 1);
    const anchor = base[base.length - 1] as Level;
    const pseudo: Route = { path: "", children: anchor.route.children ?? [] };
    const found = levelsOf(pseudo, segments);
    if (found === undefined) {
      throw new ParseError("no-route", raw, failingSegment(pseudo, segments));
    }
    const added = found.slice(1)
      .map(levelOf);
    const query = parseQuery(raw, queryRaw);
    const fragment = fragmentRaw === undefined ? undefined : decodeOrThrow(raw, fragmentRaw);
    return new Path([...base, ...added], query, fragment);
  }

  /**
   * The complete destination.
   *
   * @returns The destination, with the path, query and fragment as written.
   */
  build(): Destination {
    return Destination.make(
      this.levels.flatMap((level) => level.parts),
      this.query,
      this.fragment,
    );
  }

  /**
   * The route this position is at.
   *
   * @returns The route of the last level.
   */
  private current(): Route {
    return (this.levels[this.levels.length - 1] as Level).route;
  }

  /**
   * A position one level down, with the parts that level writes.
   *
   * @param route The child route.
   * @param parts The parts the child writes: none for a route that takes no segment.
   * @returns The new position.
   */
  private push(route: Route, parts: readonly Part[]): Path {
    return new Path([...this.levels, { route, parts }], this.query, this.fragment);
  }

  /**
   * Throws when the path has already been left for the query or the fragment.
   *
   * @throws Error when the path has already been left for the query or the fragment.
   */
  private assertPathPhase(): void {
    if (this.query.length > 0 || this.fragment !== undefined) {
      throw new Error("the path comes before the query and the fragment");
    }
  }
}

@Injectable()
/** The URL builder: starts a position at the root of the routes, or at the current route. */
export class UrlBuilder {
  private readonly router = inject(Router);
  private readonly current = inject(ActivatedRoute);

  /**
   * A position at the root of the router's routes.
   *
   * @returns A position at the root.
   */
  root(): Path {
    return Path.at([{ route: this.router.rootRoute.route, parts: [] }]);
  }

  /**
   * A position at a route, with the parts it was reached by: the current route by default, which is
   * the route the component is shown in.
   *
   * @param route The route to start at. The component's own route by default.
   * @returns A position at that route.
   */
  relativeTo(route: ActivatedRoute = this.current): Path {
    return Path.at(ancestryOf(route)
      .map((level) => ({
        route: level.route,
        parts: partsOf(level.route, level.segments),
      })));
  }

  /**
   * Parses a URL from the root of the router's routes.
   *
   * @param url The URL, such as `"/todos/7?tab=done#top"`.
   * @returns The destination the URL names.
   * @throws ParseError when no route matches the URL, or a part is malformed.
   */
  parse(url: string): Destination {
    return this.root()
      .parse(url)
      .build();
  }
}

/**
 * The route of a level, and the parts it writes.
 *
 * @param level The level of a match.
 * @returns The level with its parts.
 */
function levelOf(level: LevelMatch): Level {
  return { route: level.route, parts: partsOf(level.route, level.segments) };
}

/**
 * The parts a route writes for the segments it consumed: a param route writes a param, a `**`
 * route writes its segments as literals, a `""` route writes none.
 *
 * @param route The route.
 * @param segments The segments it consumed.
 * @returns The parts, in order.
 */
function partsOf(route: Route, segments: readonly string[]): readonly Part[] {
  const name = segmentOf(route.path);
  return segments.map((value): Part => name.startsWith(":")
    ? { kind: "param", name: name.slice(1), value }
    : { kind: "segment", value });
}

/**
 * The child of a route with the given segment, or with the given param name.
 *
 * @param route The route whose children are searched.
 * @param name The segment, or the name of the param.
 * @param isParam Whether the name is a param.
 * @returns The child route.
 * @throws Error when no such child exists under the route.
 */
function childNamed(route: Route, name: string, isParam: boolean): Route {
  const wanted = isParam ? `:${name}` : name;
  const child = (route.children ?? []).find((node) => segmentOf(node.path) === wanted);
  if (child === undefined) {
    const kind = isParam ? "param" : "segment";
    throw new Error(`no ${kind} "${name}" under "${segmentOf(route.path)}"`);
  }
  return child;
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
 * A path without its leading and trailing slashes.
 *
 * @param path The path of a route.
 * @returns The path without its slashes.
 */
function segmentOf(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

/**
 * The query pairs of a raw query string, decoded. Empty pairs are skipped.
 *
 * @param input The raw URL, for errors.
 * @param queryRaw The query part of the URL, or undefined when there is none.
 * @returns The decoded pairs, in order.
 */
function parseQuery(input: string, queryRaw: string | undefined): [string, string][] {
  const pairs: [string, string][] = [];
  for (const pair of queryRaw === undefined ? [] : queryRaw.split("&")) {
    if (pair !== "") {
      const [nameRaw, valueRaw = ""] = splitOnce(pair, "=");
      pairs.push([decodeOrThrow(input, nameRaw), decodeOrThrow(input, valueRaw)]);
    }
  }
  return pairs;
}

/**
 * The first segment that no child of the tree takes, walking down from `root`. When every segment
 * is taken, the last one: the URL stops short of a leaf.
 *
 * @param root The node the walk starts at.
 * @param segments The segments of the URL.
 * @returns The segment the walk could not place.
 */
function failingSegment(root: Route, segments: readonly string[]): string {
  let node = root;
  for (const segment of segments) {
    const child = (node.children ?? []).find((candidate) => {
      const name = segmentOf(candidate.path);
      return name === segment || name.startsWith(":") || name === "**";
    });
    if (child === undefined) {
      return segment;
    }
    node = child;
  }
  return segments[segments.length - 1] ?? "";
}

/**
 * Decodes one part of a URL, or throws a malformed ParseError for the whole input.
 *
 * @param input The raw URL being parsed.
 * @param raw The part to decode.
 * @returns The decoded part.
 * @throws ParseError with reason malformed, when the part is not valid percent-encoding.
 */
function decodeOrThrow(input: string, raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ParseError("malformed", input, raw);
  }
}

/**
 * Splits at the first `separator`: the part before it, and the part after it, if there is one.
 *
 * @param text The text to split.
 * @param separator The character to split at.
 * @returns The part before the separator, and the part after it, or undefined when there is none.
 */
function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}
