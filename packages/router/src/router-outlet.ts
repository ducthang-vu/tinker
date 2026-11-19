// RouterOutlet: where the routed component is shown. `<router-outlet></router-outlet>` shows the
// component of the first route under the root, and replaces it when that route's ActivatedRoute
// changes. A navigation that leaves the route as it was keeps the component.

import { Directive, Effect, inject, ViewContainerRef } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";
import { Router } from "./router.ts";

@Directive({ selector: "router-outlet" })
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  private readonly router = inject(Router);
  /** The activated route whose component is shown, or undefined when none is. */
  private shown: ActivatedRoute | undefined;

  /** Shows the component of the activated route under the root, when it changes. */
  @Effect() show(): void {
    const next = this.router.activated()[1];
    if (next === this.shown) {
      return;
    }
    this.container.clear();
    this.shown = next;
    if (next !== undefined) {
      this.container.createComponent(next.route.component);
    }
  }
}
