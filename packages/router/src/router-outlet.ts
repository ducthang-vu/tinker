// RouterOutlet: the place a routed component is shown. `<router-outlet></router-outlet>` shows the
// component of the route the router matches. When the match moves to another route, or to other
// params, the shown component is replaced; a change of the query or hash alone keeps it.

import { Directive, Effect, inject, ViewContainerRef } from "@tinker/core";
import type { RouteMatch, RouteParams } from "./match.ts";
import { Router } from "./router.ts";

@Directive({ selector: "router-outlet" })
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  private readonly router = inject(Router);
  /** The match whose component is shown, or undefined when nothing is. */
  private shown: RouteMatch | undefined;

  /** Shows the component of the current match, replacing it when the route or params change. */
  @Effect() show(): void {
    const match = this.router.match();
    if (match !== undefined && this.shown !== undefined && sameMatch(this.shown, match)) {
      return;
    }
    this.container.clear();
    this.shown = match;
    if (match !== undefined) {
      this.container.createComponent(match.route.component);
    }
  }
}

/** Whether two matches show the same component with the same params. */
function sameMatch(a: RouteMatch, b: RouteMatch): boolean {
  return a.route === b.route && sameParams(a.params, b.params);
}

function sameParams(a: RouteParams, b: RouteParams): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
