// The parsing of a URL into an AppPath, from the root of a route tree. The router uses it for a
// back or forward move, and the builder uses the same pieces for its own steps. It has no
// dependency on the builder, so the router can import it without a cycle.

import { levelsOf } from "../router/match.ts";
import type { Route } from "../router/route.ts";
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

/**
 * The segments a route writes for the values it consumed: a param route writes a param, any other
 * writes literals, and a route that takes none writes none.
 *
 * @param route The route.
 * @param values The values it consumed.
 * @returns The segments, in order.
 */
export function segmentsFor(route: Route, values: readonly string[]): readonly Segment[] {
  const name = segmentOf(route.path);
  return values.map((value): Segment => name.startsWith(":")
    ? { kind: "param", name: name.slice(1), value }
    : { kind: "segment", value });
}

/**
 * A path without its leading and trailing slashes.
 *
 * @param path The path of a route.
 * @returns The path without its slashes.
 */
export function segmentOf(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

/**
 * The non-empty parts of a text split on `/`.
 *
 * @param text The text to split.
 * @returns The parts, in order.
 */
export function splitSlashes(text: string): string[] {
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
export function parseQuery(input: string, queryRaw: string | undefined): Record<string, string> {
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
 * Decodes one part of a URL, or throws a malformed ParseError for the whole input.
 *
 * @param input The raw URL being parsed.
 * @param raw The part to decode.
 * @returns The decoded part.
 * @throws ParseError with reason malformed, when the part is not valid percent-encoding.
 */
export function decodeOrThrow(input: string, raw: string): string {
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
export function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

/**
 * The AppPath a URL names, matched from the root of the tree. The whole path must reach a route.
 *
 * @param root The root route of the tree.
 * @param url The URL, such as `"/todos/7?tab=done#top"`.
 * @returns The app path the URL names.
 * @throws ParseError when no route takes the whole path, or a part is malformed.
 */
export function parseAppPath(root: Route, url: string): AppPath {
  const [beforeFragment, fragmentRaw] = splitOnce(url, "#");
  const [pathRaw, queryRaw] = splitOnce(beforeFragment, "?");
  const values = splitSlashes(pathRaw)
    .map((segment) => decodeOrThrow(url, segment));
  const levels = levelsOf(root, values);
  if (levels === undefined) {
    throw new ParseError("no-route", url, values[values.length - 1] ?? "");
  }
  const segments: Segment[] = levels.flatMap((level) => segmentsFor(level.route, level.segments));
  const fragment = fragmentRaw === undefined ? undefined : decodeOrThrow(url, fragmentRaw);
  return makeAppPath(segments, parseQuery(url, queryRaw), fragment);
}
