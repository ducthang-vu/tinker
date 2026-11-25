// The app path builder: the one place an AppPath is made. It starts at the root of the route tree,
// and every step returns a new builder, so a builder can be kept and extended. Each step reads the
// routes signal and checks the segments against it, so a segment no route takes throws on that
// line,
// for static and dynamic routes alike. `relativeTo()` with no argument starts at the activated
// route
// the builder was provided in. `build()` ends the chain with an AppPath.

import { InjectionToken, inject, provide, signal, type Provider, type ReadonlySignal } from "@tinker/core";
import { match } from "@tinker/functional";
import { Router } from "../router/router.ts";
import type { Route } from "../router/route.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import { type AppPath, makeAppPath, type Segment } from "./app-path.ts";

/** A URL that could not be parsed into an AppPath of the route tree. */
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

/** The token the path builder is provided under. */
export const APP_PATH_BUILDER = new InjectionToken<AppPathBuilder>("APP_PATH_BUILDER");

/** One level of a position: the route it is at, and the segments that level writes. */
interface Level {
  /** The route of the level. */
  readonly route: Route;
  /** The segments the level writes: none for a route that takes no segment. */
  readonly segments: readonly Segment[];
}

/** What the builder reads: the routes, and the activated route of the component it is in. */
interface Context {
  /** The route tree, read on each step. */
  readonly routes: ReadonlySignal<Route>;
  /** The activated route of the component the builder is provided in, if any. */
  readonly activated: ActivatedRoute | undefined;
}

/**
 * A position in the route tree, with the segments written so far. Every step returns a new builder,
 * and `build` ends the chain with an AppPath.
 */
export class AppPathBuilder {
  /**
   * Only `in` and the steps make one.
   *
   * @param context The routes, and the activated route of the component.
   * @param levels The levels from the root down to the current route.
   * @param query The query written so far.
   * @param fragment The fragment, if one is set.
   */
  private constructor(
    private readonly context: Context,
    private readonly levels: readonly Level[],
    private readonly query: Readonly<Record<string, string>>,
    private readonly fragment: string | undefined,
  ) {}

  /**
   * A builder at the root of `routes`, in the component whose activated route is `activated`.
   *
   * @param routes The route tree, read on each step.
   * @param activated The activated route of the component, if the builder is provided in one.
   * @returns A builder at the root.
   */
  static in(routes: ReadonlySignal<Route>, activated?: ActivatedRoute): AppPathBuilder {
    return new AppPathBuilder({ routes, activated }, [], {}, undefined);
  }

  /**
   * A builder at the root of `routes`, for a tree that is not the router's. The root consumes no
   * segment, and its children are `routes`.
   *
   * @param routes The top-level routes.
   * @returns A builder at the root.
   */
  static rootOf(routes: readonly Route[]): AppPathBuilder {
    return AppPathBuilder.in(signal<Route>({ path: "", children: routes }));
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
    return new AppPathBuilder(this.context, this.extended(parts, segments.join("/"), false), {}, undefined);
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
    return new AppPathBuilder(this.context, levels, parseQuery(raw, queryRaw), fragment);
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
    return new AppPathBuilder(this.context, this.levels.slice(0, -1), {}, undefined);
  }

  /**
   * Starts at an activated route, with the segments it was reached by. With no argument, it is the
   * activated route the builder was provided in; with none there either, the root.
   *
   * @param route The activated route to start at, if not the builder's own.
   * @returns A builder at that route.
   * @throws Error when the path was already left for the query or the fragment.
   */
  relativeTo(route?: ActivatedRoute): AppPathBuilder {
    this.assertPathPhase();
    const target = route ?? this.context.activated;
    // The first activated route is the root, which has no level of its own.
    const levels = target === undefined
      ? []
      : ancestryOf(target)
          .slice(1)
          .map((level) => ({
            route: level.route,
            segments: segmentsFor(level.route, level.segments),
          }));
    return new AppPathBuilder(this.context, levels, {}, undefined);
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
    return new AppPathBuilder(this.context, this.levels, merged, this.fragment);
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
    return new AppPathBuilder(this.context, this.levels, this.query, value);
  }

  /**
   * The app path the chain has written: the segments, the query, and the fragment.
   *
   * @returns The AppPath, which is plain data.
   */
  build(): AppPath {
    return makeAppPath(this.levels.flatMap((level) => level.segments), this.query, this.fragment);
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
      ? this.context.routes()
      : (prefix[prefix.length - 1] as Level).route;
    const taken: Level[] = [];
    let index = 0;
    while (index < parts.length) {
      const part = parts[index] as string;
      const child = takenBy(node, part);
      if (child === undefined) {
        throw new ParseError("no-route", input, part);
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
 * The builder for the component it is provided in: its activated route is the default of
 * `relativeTo()`. Provide it in a component's `providers`.
 *
 * @returns The provider of the path builder.
 */
export function providePathBuilder(): Provider {
  return provide(APP_PATH_BUILDER, {
    useFactory: () => AppPathBuilder.in(inject(Router).routes, inject(ActivatedRoute)),
  });
}

/**
 * The segments a route writes for the values it consumed: a param route writes a param, any other
 * writes literals, and a route that takes none writes none.
 *
 * @param route The route.
 * @param values The values it consumed.
 * @returns The segments, in order.
 */
function segmentsFor(route: Route, values: readonly string[]): readonly Segment[] {
  const name = segmentOf(route.path);
  return values.map((value): Segment => name.startsWith(":")
    ? { kind: "param", name: name.slice(1), value }
    : { kind: "segment", value });
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
 * The non-empty parts of a text split on `/`.
 *
 * @param text The text to split.
 * @returns The parts, in order.
 */
function splitSlashes(text: string): string[] {
  return text.split("/")
    .filter((part) => part !== "");
}

/**
 * The query pairs of a raw query string, decoded. Empty pairs are skipped.
 *
 * @param input The raw URL, for errors.
 * @param queryRaw The query part of the URL, or undefined when there is none.
 * @returns The decoded pairs, by name.
 */
function parseQuery(input: string, queryRaw: string | undefined): Record<string, string> {
  const pairs: [string, string][] = [];
  for (const pair of queryRaw === undefined ? [] : queryRaw.split("&")) {
    if (pair !== "") {
      const [nameRaw, valueRaw = ""] = splitOnce(pair, "=");
      pairs.push([decodeOrThrow(input, nameRaw), decodeOrThrow(input, valueRaw)]);
    }
  }
  return Object.fromEntries(pairs);
}

/**
 * The child that takes a segment: a literal child first, then a param child, then a `**` child.
 *
 * @param node The route whose children are searched.
 * @param segment The segment to take.
 * @returns The child, or undefined when no child takes the segment.
 */
function takenBy(node: Route, segment: string): Route | undefined {
  const children = node.children ?? [];
  const literal = children.find((child) => segmentOf(child.path) === segment);
  const param = children.find((child) => segmentOf(child.path)
    .startsWith(":"));
  const rest = children.find((child) => segmentOf(child.path) === "**");
  return literal ?? param ?? rest;
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
