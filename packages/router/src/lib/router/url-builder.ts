// UrlBuilder: a URL as a path, a query and a fragment, built step by step. Each step returns a new
// builder, so a builder can be shared. A query param replaces the same key of the query it has,
// and a fragment replaces the hash.

/** A URL built from a path, a query and a fragment, as strings. */
export class UrlBuilder {
  /**
   *
   * @param path
   * @param query
   * @param hash
   */
  private constructor(
    /** The path, without its query and hash, e.g. `"/todos/7"`. */
    readonly path: string,
    private readonly query: URLSearchParams,
    private readonly hash: string,
  ) {}

  /**
   * The builder of `url`: its path, its query and its hash, as they are. A path given as segments
   * is joined first: `["todos", "7"]` is `"todos/7"`.
   * @param url
   * @returns A builder for the URL.
   */
  static from(url: string | readonly string[]): UrlBuilder {
    const text = typeof url === "string" ? url : url.join("/");
    const cut = text.search(/[?#]/);
    const path = cut === -1 ? text : text.slice(0, cut);
    const rest = cut === -1 ? "" : text.slice(cut);
    const hashAt = rest.indexOf("#");
    return new UrlBuilder(
      path,
      new URLSearchParams(hashAt === -1 ? rest : rest.slice(0, hashAt)),
      hashAt === -1 ? "" : rest.slice(hashAt + 1),
    );
  }

  /**
   * The non-empty segments of the path: `"/todos/7"` is `["todos", "7"]`.
   * @returns The non-empty segments of the path.
   */
  get segments(): readonly string[] {
    return this.path.split("/")
      .filter((segment) => segment !== "");
  }

  /**
   * The same URL with `params` set over its query: a param replaces the same key.
   * @param params
   * @returns A builder with the query set.
   */
  withQuery(params: Readonly<Record<string, string>>): UrlBuilder {
    const query = new URLSearchParams(this.query);
    for (const [key, value] of Object.entries(params)) {
      query.set(key, value);
    }
    return new UrlBuilder(this.path, query, this.hash);
  }

  /**
   * The same URL with `fragment` as its hash. Undefined keeps the hash; "" removes it.
   * @param fragment
   * @returns A builder with the fragment set.
   */
  withFragment(fragment: string | undefined): UrlBuilder {
    return new UrlBuilder(this.path, this.query, fragment ?? this.hash);
  }

  /**
   * The same URL resolved against `base`, the path of the route it is relative to. A path that
   * starts with "/" is absolute; "." stays, ".." goes up one segment (never above the root), and
   * any other segment goes down. The query and the hash are kept.
   * @param base
   * @returns A builder for the URL, resolved against the base.
   */
  resolve(base: readonly string[]): UrlBuilder {
    const start = this.path.startsWith("/") ? [] : base;
    const segments = this.path.split("/")
      .reduce(step, start);
    return new UrlBuilder(`/${segments.join("/")}`, this.query, this.hash);
  }

  /**
   * The URL as a string.
   * @returns The URL, as a string.
   */
  build(): string {
    const search = this.query.toString();
    const fragment = this.hash === "" ? "" : `#${this.hash}`;
    return `${this.path}${search === "" ? "" : `?${search}`}${fragment}`;
  }
}

/**
 * The base after one part of a relative URL.
 * @param segments The segments so far.
 * @param part The part to add.
 * @returns The base after the part.
 */
function step(segments: readonly string[], part: string): readonly string[] {
  if (part === "" || part === ".") {
    return segments;
  }
  if (part === "..") {
    return segments.slice(0, -1);
  }
  return [...segments, part];
}
