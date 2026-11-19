// The one place the router touches the browser's location and history. The router talks to this
// interface; the browser implementation below is the default, and a test provides a fake.

import { InjectionToken } from "@tinker/core";

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
}

/** The platform location, a token so a test can replace the browser. */
export const PLATFORM_LOCATION = new InjectionToken<PlatformLocation>("PLATFORM_LOCATION");

/** The browser's own location and history. */
export const browserPlatformLocation: PlatformLocation = {
  url: () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
  state: () => window.history.state,
  push: (url, state) => window.history.pushState(state, "", url),
  replace: (url, state) => window.history.replaceState(state, "", url),
  onPop: (listener) => {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  },
};
