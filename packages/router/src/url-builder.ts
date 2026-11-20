// UrlBuilder: a URL as a path, a query and a fragment, built step by step. Each step returns a new
// builder, so a builder can be shared. A query param replaces the same key of the query it has,
// and a fragment replaces the hash.

export class UrlBuilder {
  private constructor(
    /** The path, without its query and hash, e.g. `"/todos/7"`. */
    readonly path: string,
    private readonly query: URLSearchParams,
    private readonly hash: string,
  ) {}

  /**
   * The builder of `url`: its path, its query and its hash, as they are. A path given as segments
   * is joined first: `["todos", "7"]` is `"todos/7"`.
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

  /** The same URL with `params` set over its query: a param replaces the same key. */
  withQuery(params: Readonly<Record<string, string>>): UrlBuilder {
    const query = new URLSearchParams(this.query);
    for (const [key, value] of Object.entries(params)) {
      query.set(key, value);
    }
    return new UrlBuilder(this.path, query, this.hash);
  }

  /** The same URL with `fragment` as its hash. Undefined keeps the hash; "" removes it. */
  withFragment(fragment: string | undefined): UrlBuilder {
    return new UrlBuilder(this.path, this.query, fragment ?? this.hash);
  }

  /**
   * The same URL resolved against `base`, the path of the route it is relative to. A path that
   * starts with "/" is absolute; "." stays, ".." goes up one segment (never above the root), and
   * any other segment goes down. The query and the hash are kept.
   */
  resolve(base: readonly string[]): UrlBuilder {
    const start = this.path.startsWith("/") ? [] : base;
    const segments = this.path.split("/")
      .reduce(step, start);
    return new UrlBuilder(`/${segments.join("/")}`, this.query, this.hash);
  }

  /** The URL as a string. */
  build(): string {
    const search = this.query.toString();
    const fragment = this.hash === "" ? "" : `#${this.hash}`;
    return `${this.path}${search === "" ? "" : `?${search}`}${fragment}`;
  }
}

/** The base after one part of a relative URL. */
function step(segments: readonly string[], part: string): readonly string[] {
  if (part === "" || part === ".") {
    return segments;
  }
  if (part === "..") {
    return segments.slice(0, -1);
  }
  return [...segments, part];
}
