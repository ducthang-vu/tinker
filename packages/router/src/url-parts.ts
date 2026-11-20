// The parts a routerlink adds to its destination: query params and a fragment. The path stays as it
// is. A query param replaces the same key of the URL's own query, and a fragment replaces its hash.

/** The URL with `query` set over its own query, and `fragment` as its hash when one is given. */
export function withParts(
  url: string,
  query: Readonly<Record<string, string>> | undefined,
  fragment: string | undefined,
): string {
  const cut = url.search(/[?#]/);
  const path = cut === -1 ? url : url.slice(0, cut);
  const rest = cut === -1 ? "" : url.slice(cut);
  const hashAt = rest.indexOf("#");
  const params = new URLSearchParams(hashAt === -1 ? rest : rest.slice(0, hashAt));
  for (const [key, value] of Object.entries(query ?? {})) {
    params.set(key, value);
  }
  const search = params.toString();
  const hash = fragment ?? (hashAt === -1 ? "" : rest.slice(hashAt + 1));
  return `${path}${search === "" ? "" : `?${search}`}${hash === "" ? "" : `#${hash}`}`;
}

/** The path of a URL, without its query and hash. */
export function pathPartOf(url: string): string {
  return url.replace(/[?#].*$/, "");
}
