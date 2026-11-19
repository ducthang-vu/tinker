// RouterLink: an anchor that navigates the router instead of reloading the page. Its behaviour
// comes later.

import { Directive, input } from "@tinker/core";

@Directive({ selector: "a[routerlink]" })
export class RouterLink {
  /** The destination: a path, or the segments of one, e.g. `"/todos"` or `["todos", "7"]`. */
  readonly routerlink = input<string | readonly string[] | undefined>(undefined);
}
