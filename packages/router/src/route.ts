// A route: a path, and the component it shows. A list of routes is the route table the router
// matches a URL against; the component of the first match is the one shown.

import type { Class } from "@tinker/core";

export interface Route {
  /**
   * The path the route matches, e.g. `"/todos"`. A segment that starts with `:` is a param,
   * so `"/todos/:id"` matches `"/todos/7"` with `id` set to `"7"`. The path `"**"` matches any
   * URL, for a page shown when nothing else matches.
   */
  readonly path: string;
  /** The component shown when the route matches. */
  readonly component: Class<object>;
  /** Static data of the route, read from the `ActivatedRoute` of the component it shows. */
  readonly data?: Readonly<Record<string, unknown>>;
  /**
   * The routes under this one, matched against the segments after this route's path. A child's
   * component is shown by an outlet inside this route's component.
   */
  readonly children?: readonly Route[];
}
