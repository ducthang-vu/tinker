// The app's base: the deployment prefix the app is served under, such as "/app" for an app at
// example.com/app. Only the browser boundary knows it. Destinations and routes stay app-relative:
// `toBrowserUrl` adds the prefix to make a URL the browser understands, and `fromBrowserUrl`
// removes it.

import { InjectionToken } from "@tinker/core";
import { None, Some, type Maybe } from "@tinker/functional";
import type { AppPath } from "../destination/app-path.ts";

/** The base the app is served under, without a trailing slash. `""` when served at the root. */
export const APP_BASE = new InjectionToken<string>("APP_BASE");

/**
 * The base without its trailing slash, so `/app/` and `/app` are the same base.
 * @param base
 * @param base The base to normalize.
 * @returns The base without a trailing slash.
 */
function normalized(base: string): string {
  return base.replace(/\/+$/, "");
}

/**
 * The full browser URL of a destination: the base, then the app-relative URL.
 *
 * @param destination The app-relative destination.
 * @param base The base the app is served under.
 * @returns The URL the browser uses, with the base.
 */
export function toBrowserUrl(destination: AppPath, base: string): string {
  return `${normalized(base)}${destination.format()}`;
}

/**
 * The app-relative URL of a browser URL: the base taken off, if the URL is under it.
 *
 * @param browserUrl A URL as the browser has it, with the base.
 * @param base The base the app is served under.
 * @returns The app-relative URL, or None when the URL is not under the base.
 */
export function fromBrowserUrl(browserUrl: string, base: string): Maybe<string> {
  const prefix = normalized(base);
  if (prefix === "") {
    return Some.of(browserUrl);
  }
  if (browserUrl === prefix) {
    return Some.of("/");
  }
  const rest = browserUrl.startsWith(`${prefix}/`) ? browserUrl.slice(prefix.length) : undefined;
  if (rest === undefined) {
    return None.of();
  }
  return Some.of(rest);
}
