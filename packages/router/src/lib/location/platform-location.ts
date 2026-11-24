// The one place the router touches the browser's location and history. The router talks to this
// interface; the browser implementation below is the default, and a test provides a fake.
//
// The browser implementation reads the folder the app is served under from the page's <base>
// element, which the build writes: "/" when there is none, "/tinker/" for a project site. The app's
// routes are then "/" and "/api" wherever it is served.

import { InjectionToken } from "@tinker/core";

/** The browser's location and history, behind an interface so tests can replace it. */
export interface PlatformLocation {
  /** The current path, query and hash, e.g. `"/todos/7?tab=done#top"`. */
  url(): string;
  /** The state of the current history entry. */
  state(): unknown;
  /** Add a history entry for `url`, with `state`. Does not fire `popstate`. */
  push(url: string, state: unknown): void;
  /** Replace the current history entry with `url` and `state`. */
  replace(url: string, state: unknown): void;
  /** Call `listener` when the user goes back or forward. Returns the function that stops it. */
  onPop(listener: () => void): () => void;
  /**
   * The `href` a link to the app's `path` gets in the page, in the browser's form: for an app
   * served under a folder, the folder is added. Optional: without it, the path is the href.
   */
  href?(path: string): string;
}

/** The platform location, a token so a test can replace the browser. */
export const PLATFORM_LOCATION = new InjectionToken<PlatformLocation>("PLATFORM_LOCATION");

/**
 * The folder the app is served under, from the page's `<base>` element, ending in "/": "/" when
 * the page has none.
 *
 * @returns The path of the base, such as "/" or "/tinker/".
 */
export function appBase(): string {
  const base = document.querySelector("base");
  if (base === null) {
    return "/";
  }
  const { pathname } = new URL(base.href);
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/**
 * The app's path for a browser `url` under `base` (which ends in "/"): "/tinker/api" is "/api".
 *
 * @param base The folder the app is served under.
 * @param url The browser's path, query and hash.
 * @returns The path as the app sees it.
 */
export function toAppPath(base: string, url: string): string {
  const root = base.slice(0, -1);
  if (url === root) {
    return "/";
  }
  return url.startsWith(base) ? url.slice(root.length) : url;
}

/**
 * The browser's path for an app `path` under `base`: "/api" is "/tinker/api".
 *
 * @param base The folder the app is served under.
 * @param path The app's path.
 * @returns The path in the browser.
 */
export function toBrowserPath(base: string, path: string): string {
  return `${base.slice(0, -1)}${path}`;
}

/** The browser's own location and history, under the folder the app is served from. */
export const browserPlatformLocation: PlatformLocation = {
  url: () => toAppPath(
    appBase(),
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  ),
  state: () => window.history.state,
  push: (url, state) => window.history.pushState(state, "", toBrowserPath(appBase(), url)),
  replace: (url, state) => window.history.replaceState(state, "", toBrowserPath(appBase(), url)),
  onPop: (listener) => {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  },
  href: (path) => toBrowserPath(appBase(), path),
};
