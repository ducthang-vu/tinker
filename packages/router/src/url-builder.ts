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

  /** The builder of `url`: its path, its query and its hash, as they are. */
  static from(url: string): UrlBuilder {
    const cut = url.search(/[?#]/);
    const path = cut === -1 ? url : url.slice(0, cut);
    const rest = cut === -1 ? "" : url.slice(cut);
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

  /** The URL as a string. */
  build(): string {
    const search = this.query.toString();
    const fragment = this.hash === "" ? "" : `#${this.hash}`;
    return `${this.path}${search === "" ? "" : `?${search}`}${fragment}`;
  }
}
