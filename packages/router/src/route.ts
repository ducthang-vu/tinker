// A route: a path, and the component it shows. The routes form a tree, from one root route: a
// route's children match the segments its path leaves over, and the router matches a URL against
// the tree, from the root.

import type { Class } from "@tinker/core";
import type { Guard } from "./navigation.ts";

export interface Route {
  /**
   * The path the route consumes, e.g. `"/todos"`. A segment that starts with `:` is a param, so
   * `"/todos/:id"` matches `"/todos/7"` with `id` set to `"7"`. The path `"**"` matches any URL,
   * for a page shown when nothing else matches; declare it last among the children.
   */
  readonly path: string;
  /** The component shown when the route matches. */
  readonly component: Class<object>;
  /** Static data of the route, read from the `ActivatedRoute` of the component it shows. */
  readonly data?: Readonly<Record<string, unknown>>;
  /**
   * The routes under this one, matched against the segments its path leaves over, in order; the
   * first that matches wins. A route without children must match the whole URL.
   */
  readonly children?: readonly Route[];
  /**
   * Guards that decide whether a navigation to this route may commit. They run on every navigation
   * whose URL matches this route, in order, and the first one that does not say `true` decides. A
   * guard of a parent route runs before those of its children. See navigation.ts.
   */
  readonly canActivate?: readonly Guard[];
}
