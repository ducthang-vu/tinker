// A route: a path, and the component it shows. A list of routes is the route table the router
// matches a URL against; the component of the first match is the one shown.

import type { Provider } from "../di/index.ts";
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
  /**
   * Services for the routed component and what it contains: provided in its injector, so each
   * time the route is shown gets its own, destroyed when the component is.
   */
  readonly providers?: readonly Provider[];
}
