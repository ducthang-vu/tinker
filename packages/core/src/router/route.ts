// A route: a path, and the component it shows. A list of routes is the route table the router
// matches a URL against; the component of the first match is the one shown.

import type { Class } from "../utils/types.ts";

export interface Route {
  /**
   * The path the route matches, e.g. `"/todos"`. A segment that starts with `:` is a param,
   * so `"/todos/:id"` matches `"/todos/7"` with `id` set to `"7"`.
   */
  readonly path: string;
  /** The component shown when the route matches. */
  readonly component: Class<object>;
  /** Static data of the route, read from the `ActivatedRoute` of the component it shows. */
  readonly data?: Readonly<Record<string, unknown>>;
}
