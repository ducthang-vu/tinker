// The router reads the browser's URL as the app's own paths. When the app is served under a
// folder (GitHub Pages serves this example at "/tinker/"), that folder is the base: it is stripped
// when the router reads a URL, and added back when it writes one. The routes stay "/" and "/api".

import { browserPlatformLocation, type PlatformLocation } from "@tinker/router";

/** The app's path for a browser `url` under `base` (which ends in "/"): "/tinker/api" is "/api". */
export function toAppPath(base: string, url: string): string {
  const root = base.slice(0, -1);
  if (url === root) {
    return "/";
  }
  return url.startsWith(base) ? url.slice(root.length) : url;
}

/** The browser's path for an app `path` under `base`: "/api" is "/tinker/api". */
export function toBrowserPath(base: string, path: string): string {
  return `${base.slice(0, -1)}${path}`;
}

/** The browser's location, as seen from an app served under `base`. */
export function basedPlatformLocation(base: string): PlatformLocation {
  return {
    url: () => toAppPath(base, browserPlatformLocation.url()),
    state: () => browserPlatformLocation.state(),
    push: (url, state) => browserPlatformLocation.push(toBrowserPath(base, url), state),
    replace: (url, state) => browserPlatformLocation.replace(toBrowserPath(base, url), state),
    onPop: (listener) => browserPlatformLocation.onPop(listener),
    href: (path) => toBrowserPath(base, path),
  };
}
