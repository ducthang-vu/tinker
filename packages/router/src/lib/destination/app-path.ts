// AppPath: a complete, app-relative URL as plain data. It has no base and no origin: the app's base
// is added at the browser boundary, and nothing inside the router sees it. An AppPath is made only
// by
// the builder, which checks each segment against the route tree, so a value in the router is always
// one the tree was asked for. This module has no imports, so the pipeline can use it without
// importing
// the builder.

/** One segment of the URL: a literal, or a param with the value it was given. */
export type Segment
  = | {
    /** A literal segment of the path. */
    readonly kind: "segment";
    /** The segment, as it is in the URL. */
    readonly value: string;
  }
  | {
    /** A param of the path. */
    readonly kind: "param";
    /** The param's name, as declared with a colon. */
    readonly name: string;
    /** The value the param takes in the URL. */
    readonly value: string;
  };

/** The brand of an AppPath: only this module sets it, so a value without it was not made here. */
export const APP_PATH_BRAND: unique symbol = Symbol("AppPath");

/** A complete, app-relative URL: the segments, the query, and the fragment. */
export interface AppPath {
  /** The brand that only this module sets. */
  readonly [APP_PATH_BRAND]: true;
  /** The segments of the path, in order. */
  readonly segments: readonly Segment[];
  /** The query, always serialized in the order its keys were given. */
  readonly query: Readonly<Record<string, string>>;
  /** The fragment, without its `#`, or undefined when there is none. */
  readonly fragment: string | undefined;
  /**
   * The URL as a string: the segments, the query, and the fragment, each percent-encoded.
   *
   * @returns The app-relative URL.
   */
  format(): string;
}

/** The one implementation of AppPath. Not exported: values are made by `makeAppPath`. */
class AppPathValue implements AppPath {
  readonly [APP_PATH_BRAND] = true as const;
  readonly query: Readonly<Record<string, string>>;

  /**
   * The value of a path. Only `makeAppPath` calls it.
   *
   * @param segments The segments of the path, in order.
   * @param query The query, copied so that the value cannot change.
   * @param fragment The fragment, if any.
   */
  constructor(
    readonly segments: readonly Segment[],
    query: Readonly<Record<string, string>>,
    readonly fragment: string | undefined,
  ) {
    this.query = Object.freeze({ ...query });
  }

  /**
   * The URL as a string: the segments, the query, and the fragment, each percent-encoded.
   *
   * @returns The app-relative URL.
   */
  format(): string {
    const path = `/${this.segments.map((segment) => encodeURIComponent(segment.value))
      .join("/")}`;
    const pairs = Object.entries(this.query)
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    const query = pairs.length === 0 ? "" : `?${pairs.join("&")}`;
    const fragment = this.fragment === undefined ? "" : `#${encodeURIComponent(this.fragment)}`;
    return `${path}${query}${fragment}`;
  }
}

/**
 * Makes an AppPath from segments that have been checked against the route tree. Only the builder
 * calls it.
 *
 * @param segments The segments of the path, in order.
 * @param query The query, serialized in the order its keys were given.
 * @param fragment The fragment, if any.
 * @returns The app path.
 */
export function makeAppPath(
  segments: readonly Segment[],
  query: Readonly<Record<string, string>>,
  fragment: string | undefined,
): AppPath {
  return new AppPathValue(segments, query, fragment);
}
