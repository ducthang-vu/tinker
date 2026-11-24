// The typed URL builder. A UrlBuilder walks the route tree as it is given: each step moves to a
// child route, and the types only offer the children and params that exist there. The path comes
// first, then the query, then the fragment; the types enforce that order, and the run-time checks
// repeat it. `up()` goes to the parent. A Destination is the complete value a builder returns:
// plain data, that only this module can make.

import { match } from "@tinker/functional";
import type { ActivatedRoute } from "../state/activated-route.ts";

/** A route as the builder sees it: a path (one segment, literal or `:param`) and its children. */
export interface RouteNode {
  readonly path: string;
  readonly children?: readonly RouteNode[];
}

/** One step of the path: a literal segment, or a param with the value it was given. */
export type Part
  = | { readonly kind: "segment"; readonly value: string }
    | { readonly kind: "param"; readonly name: string; readonly value: string };

/** The phases of a builder, in the order a URL is written. */
export type Phase = "path" | "query" | "fragment";

/** What has been written so far, with no completeness check. */
export interface PartialDestination {
  readonly parts: readonly Part[];
  readonly query: readonly (readonly [string, string])[];
  readonly fragment: string | undefined;
}

/** A complete, app-relative destination. Only this module makes one. */
export class Destination {
  private constructor(
    private readonly token: typeof BUILT,
    readonly parts: readonly Part[],
    readonly query: readonly (readonly [string, string])[],
    readonly fragment: string | undefined,
  ) {}

  /**
   * The destination as an app-relative URL: the path, the query, and the fragment.
   *
   * @returns The URL, for the browser boundary or for display.
   */
  format(): string {
    const path = `/${this.parts.map((part) => encodeURIComponent(part.value))
      .join("/")}`;
    const pairs = this.query.map(
      ([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    );
    const query = pairs.length === 0 ? "" : `?${pairs.join("&")}`;
    const fragment = this.fragment === undefined ? "" : `#${encodeURIComponent(this.fragment)}`;
    return `${path}${query}${fragment}`;
  }

  /**
   * Makes a destination from parts that have been checked against the tree.
   *
   * @param parts The path, in order.
   * @param query The query pairs, in order.
   * @param fragment The fragment, if any.
   * @returns The destination.
   */
  static make(
    parts: readonly Part[],
    query: readonly (readonly [string, string])[],
    fragment: string | undefined,
  ): Destination {
    return new Destination(BUILT, parts, query, fragment);
  }
}

/** Only this module holds this symbol, so only this module can make a Destination. */
const BUILT: unique symbol = Symbol("built");

/** A route tree's root: the path is empty and its children are the top-level routes. */
type RootOf<Routes> = { readonly path: ""; readonly children: Routes };

/** The children of a route node, as a union. */
type Children<Node> = Node extends { readonly children: infer C extends readonly unknown[] }
  ? C[number]
  : never;

/** The path of a route node. */
type PathOf<Node> = Node extends { readonly path: infer P extends string } ? P : never;

/** A path without its leading slash. */
type Trim<P extends string> = P extends `/${infer R}` ? Trim<R> : P;

/** Whether a node's path is only known at run time: then every name is allowed. */
type Loose<Node> = string extends PathOf<Node> ? true : false;

/** The segments a literal child may be: a child's path without its leading slash. */
type ChildPaths<Node> = Loose<Node> extends true
  ? string
  : Trim<Exclude<PathOf<Children<Node>>, `${string}:${string}`>>;

/** The param names declared by the children of a node, with or without a leading slash. */
type ParamNames<Node> = Loose<Node> extends true
  ? string
  : Children<Node> extends infer C
    ? C extends { readonly path: `:${infer Name}` | `/:${infer Name}` }
      ? Name
      : never
    : never;

/** The child a literal segment leads to. */
type ChildOf<Node, Segment extends string> = Loose<Node> extends true
  ? RouteNode
  : Extract<Children<Node>, { readonly path: Segment | `/${Segment}` }>;

/** The child a param name leads to. */
type ParamChildOf<Node, Name extends string> = Loose<Node> extends true
  ? RouteNode
  : Extract<Children<Node>, { readonly path: `:${Name}` | `/:${Name}` }>;

/** The last node of a stack of nodes: the route the builder is at. */
type Last<Stack extends readonly unknown[]> = Stack extends readonly [...unknown[], infer L]
  ? L
  : Stack[number];

/** The stack without its last node: one level up. Never at the root. */
type Pop<Stack extends readonly RouteNode[]> = Stack extends readonly [RouteNode]
  ? never
  : Stack extends readonly [...infer Rest extends readonly RouteNode[], RouteNode]
    ? Rest
    : Stack;

/** The path of a route node segment, without leading or trailing slashes. */
function segmentOf(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

/** The route nodes from the root down to `route`, root first. */
function ancestryOf(route: ActivatedRoute): readonly ActivatedRoute[] {
  const above = match(route.parent, {
    Some: (parent) => ancestryOf(parent),
    None: () => [],
  });
  return [...above, route];
}

/** A URL that could not be parsed into a destination of the tree. */
export class ParseError extends Error {
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

/** Decodes one part of a URL, or throws a malformed ParseError for the whole input. */
function decodeOrThrow(input: string, raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ParseError("malformed", input, raw);
  }
}

/** Splits at the first `separator`: the part before it, and the part after it, if there is one. */
function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

/**
 * The URL builder. Created with `UrlBuilder.for(routes)` for the whole tree, or `UrlBuilder.from`
 * for a relative start. Each step returns a new builder, so a builder can be kept and reused.
 */
export class UrlBuilder<Stack extends readonly RouteNode[], Ph extends Phase> {
  /** Type only: the route stack and the phase, so the types can tell builders apart. */
  declare readonly stack: Stack;
  declare readonly phase: Ph;

  private constructor(
    private readonly nodes: readonly RouteNode[],
    private readonly parts: readonly Part[],
    private readonly query: readonly (readonly [string, string])[],
    private readonly fragment: string | undefined,
  ) {}

  /**
   * A builder at the root of `routes`.
   *
   * @param routes The top-level routes, as declared (use `as const` to keep their paths literal).
   * @returns A builder at the root, in the path phase.
   */
  static for<Routes extends readonly RouteNode[]>(
    routes: Routes,
  ): UrlBuilder<[RootOf<Routes>], "path"> {
    return UrlBuilder.make<[RootOf<Routes>], "path">(
      [{ path: "", children: routes }],
      [],
      [],
      undefined,
    );
  }

  /**
   * A builder that starts at an activated route, for a destination relative to it.
   *
   * @param route The route to start at. Use the injected `ActivatedRoute` for the current one.
   * @returns A builder at that route, with its path already written.
   */
  static from(route: ActivatedRoute): UrlBuilder<readonly RouteNode[], "path"> {
    const chain = ancestryOf(route);
    const nodes: RouteNode[] = chain.map((level) => level.route);
    const parts: Part[] = chain.slice(1)
      .map((level) => {
        const name = segmentOf(level.route.path);
        return name.startsWith(":")
          ? { kind: "param", name: name.slice(1), value: level.params[name.slice(1)] ?? "" }
          : { kind: "segment", value: name };
      });
    return UrlBuilder.make<readonly RouteNode[], "path">(nodes, parts, [], undefined);
  }

  /** What has been written so far. Inspectable, but not a destination until `build`. */
  get partial(): PartialDestination {
    return { parts: this.parts, query: this.query, fragment: this.fragment };
  }

  /**
   * Moves to a child with a literal path. Throws when no such child exists. To go to the parent,
   * use `up`.
   *
   * @param segment The child's path without its leading slash.
   * @returns A builder at that child.
   */
  withSegment<S extends ChildPaths<Last<Stack>>>(
    this: UrlBuilder<Stack, "path">,
    segment: S,
  ): UrlBuilder<[...Stack, ChildOf<Last<Stack>, S>], "path"> {
    this.assertPathPhase();
    const child = this.childNamed(segment, false);
    return UrlBuilder.make<[...Stack, ChildOf<Last<Stack>, S>], "path">(
      [...this.nodes, child],
      [...this.parts, { kind: "segment", value: segment }],
      this.query,
      this.fragment,
    );
  }

  /**
   * Moves to a child with a param, and gives the param its value. Throws when no such param exists.
   *
   * @param name The param's name, as declared with a colon in the path.
   * @param value The value of the param, in the URL.
   * @returns A builder at that child.
   */
  withParam<N extends ParamNames<Last<Stack>>>(
    this: UrlBuilder<Stack, "path">,
    name: N,
    value: string,
  ): UrlBuilder<[...Stack, ParamChildOf<Last<Stack>, N>], "path"> {
    const child = this.childNamed(name, true);
    return UrlBuilder.make<[...Stack, ParamChildOf<Last<Stack>, N>], "path">(
      [...this.nodes, child],
      [...this.parts, { kind: "param", name, value }],
      this.query,
      this.fragment,
    );
  }

  /**
   * Moves back to the parent route. Throws at the root.
   *
   * @returns A builder at the parent.
   */
  up(
    this: UrlBuilder<Stack, "path"> & (Stack extends readonly [RouteNode] ? never : unknown),
  ): UrlBuilder<Pop<Stack>, "path"> {
    this.assertPathPhase();
    return this.goUp<Pop<Stack>>();
  }

  /**
   * Adds a query pair. Allowed after the path and before the fragment, and any number of times.
   *
   * @param name The query name.
   * @param value The query value. It is percent-encoded.
   * @returns A builder in the query phase.
   */
  withQuery(
    this: UrlBuilder<Stack, "path" | "query">,
    name: string,
    value: string,
  ): UrlBuilder<Stack, "query"> {
    if (this.fragment !== undefined) {
      throw new Error("withQuery: the fragment comes last");
    }
    return UrlBuilder.make<Stack, "query">(
      this.nodes,
      this.parts,
      [...this.query, [name, value]],
      this.fragment,
    );
  }

  /**
   * Sets the fragment. It comes last, so nothing can follow it.
   *
   * @param value The fragment, without its `#`. It is percent-encoded.
   * @returns A builder in the fragment phase.
   */
  withFragment(
    this: UrlBuilder<Stack, "path" | "query">,
    value: string,
  ): UrlBuilder<Stack, "fragment"> {
    if (this.fragment !== undefined) {
      throw new Error("withFragment: the fragment is already set");
    }
    return UrlBuilder.make<Stack, "fragment">(this.nodes, this.parts, this.query, value);
  }

  /**
   * The complete destination.
   *
   * @returns The destination, with the path, query and fragment as built.
   */
  build(): Destination {
    return Destination.make(this.parts, this.query, this.fragment);
  }

  /**
   * Parses a raw URL of the whole tree into a destination. Parsing starts at the root whatever the
   * builder's position. Each segment is matched in declaration order, as the router matches: a
   * literal child, or a param child that takes any value. `..` is an ordinary segment, so it fails.
   *
   * @param raw The raw URL, such as `"/todos/7?tab=done#top"`.
   * @returns The destination.
   * @throws ParseError when the URL is not one of the tree's, or a part is malformed.
   */
  parse(raw: string): Destination {
    const [beforeFragment, fragmentRaw] = splitOnce(raw, "#");
    const [pathRaw, queryRaw] = splitOnce(beforeFragment, "?");
    const parts: Part[] = [];
    const nodes: RouteNode[] = [this.nodes[0] as RouteNode];

    for (const rawSegment of pathRaw.split("/")
      .filter((segment) => segment !== "")) {
      const segment = decodeOrThrow(raw, rawSegment);
      const current = nodes[nodes.length - 1] as RouteNode;
      const child = (current.children ?? []).find((node) => {
        const name = segmentOf(node.path);
        return name === segment || name.startsWith(":");
      });
      if (child === undefined) {
        throw new ParseError("no-route", raw, segment);
      }
      const name = segmentOf(child.path);
      parts.push(name.startsWith(":")
        ? { kind: "param", name: name.slice(1), value: segment }
        : { kind: "segment", value: segment });
      nodes.push(child);
    }

    const query: [string, string][] = [];
    for (const pair of queryRaw === undefined ? [] : queryRaw.split("&")) {
      if (pair === "") {
        continue;
      }
      const [nameRaw, valueRaw = ""] = splitOnce(pair, "=");
      query.push([decodeOrThrow(raw, nameRaw), decodeOrThrow(raw, valueRaw)]);
    }

    const fragment = fragmentRaw === undefined ? undefined : decodeOrThrow(raw, fragmentRaw);
    return Destination.make(parts, query, fragment);
  }

  /**
   * A builder with the given stack, in the given phase. The types carry the stack; the nodes are
   * the same routes, in the same order.
   */
  private static make<S extends readonly RouteNode[], P extends Phase>(
    nodes: readonly RouteNode[],
    parts: readonly Part[],
    query: readonly (readonly [string, string])[],
    fragment: string | undefined,
  ): UrlBuilder<S, P> {
    return new UrlBuilder<S, P>(nodes, parts, query, fragment);
  }

  /** One level up: the node and the part of the current route are dropped. Throws at the root. */
  private goUp<S extends readonly RouteNode[]>(): UrlBuilder<S, "path"> {
    if (this.nodes.length === 1) {
      throw new Error("up: already at the root");
    }
    return UrlBuilder.make<S, "path">(
      this.nodes.slice(0, -1),
      this.parts.slice(0, -1),
      this.query,
      this.fragment,
    );
  }

  /** The child of the current route with the given name, or throws. */
  private childNamed(name: string, isParam: boolean): RouteNode {
    const current = this.nodes[this.nodes.length - 1] as RouteNode;
    const wanted = isParam ? `:${name}` : name;
    const child = (current.children ?? []).find((node) => segmentOf(node.path) === wanted);
    if (child === undefined) {
      const kind = isParam ? "param" : "segment";
      throw new Error(`no ${kind} "${name}" under "${segmentOf(current.path)}"`);
    }
    return child;
  }

  /** Throws when the path has already been left for the query or the fragment. */
  private assertPathPhase(): void {
    if (this.query.length > 0 || this.fragment !== undefined) {
      throw new Error("the path comes before the query and the fragment");
    }
  }
}
