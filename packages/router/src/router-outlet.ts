// RouterOutlet: where the routed component is shown. It shows the activated route after the one it
// sits in, read through Router.childOf, and replaces the component when that route changes.

import { Directive, Effect, inject, ViewContainerRef } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { Router } from "./router.ts";

@Directive({ selector: "router-outlet" })
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  private readonly router = inject(Router);
  /** The activated route of the component this outlet sits in. */
  private readonly own = inject(ActivatedRoute);
  /** The activated route whose component is shown, or undefined when none is. */
  private shown: ActivatedRoute | undefined;

  /** Shows the component of the next activated route, replacing it when that route changes. */
  @Effect() show(): void {
    const next = this.router.childOf(this.own);
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
