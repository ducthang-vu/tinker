// A destination: a complete, app-relative URL as plain data. Only the URL builder makes one, so
// every destination has been checked against the route tree when it was built. This module has no
// imports, so the pipeline can use a destination without importing the builder.

/** One step of the path: a literal segment, or a param with the value it was given. */
export type Part
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

/** Only this module holds this symbol, so only this module can make a Destination. */
const BUILT: unique symbol = Symbol("built");

/** A complete, app-relative destination. Only the URL builder makes one. */
export class Destination {
  /**
   * Only `make` makes one: the token keeps other code from building a Destination.
   *
   * @param token The token only this module holds.
   * @param parts The parts of the path.
   * @param query The query pairs.
   * @param fragment The fragment, if any.
   */
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
   * Makes a destination from parts that have been checked against the route tree.
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
