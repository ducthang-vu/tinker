// RouterOutlet: where the routed component is shown. It shows the activated route that its owner
// provides as ChildActivatedRoute, and replaces the component when that route changes.

import { Directive, Effect, inject, ViewContainerRef } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";
import { ChildActivatedRoute } from "./child-activated-route.ts";

@Directive({ selector: "router-outlet" })
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  private readonly next = inject(ChildActivatedRoute);
  /** The activated route whose component is shown, or undefined when none is. */
  private shown: ActivatedRoute | undefined;

  /** Shows the component of the next activated route, replacing it when that route changes. */
  @Effect() private show(): void {
    const route = this.next();
    if (route === this.shown) {
      return;
    }
    this.container.clear();
    this.shown = route;
    if (route !== undefined) {
      this.container.createComponent(route.route.component);
    }
  }
}
