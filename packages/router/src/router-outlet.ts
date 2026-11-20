// RouterOutlet: where the routed component is shown. It shows the activated route that its owner
// provides as ChildActivatedRoute. The token only changes when that route does, so the component is
// replaced exactly then.

import { Directive, Effect, inject, provide, ViewContainerRef } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { ChildActivatedRoute } from "./child-activated-route.ts";

@Directive({ selector: "router-outlet" })
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  private readonly next = inject(ChildActivatedRoute);

  /** Shows the component of the next activated route, replacing the one shown. */
  @Effect() private show(): void {
    this.container.clear();
    this.next()
      .ifSome((route) => {
      // The component injects its own ActivatedRoute, which is the route it is shown for.
        this.container.createComponent(route.route.component, this.container.length, [
          provide(ActivatedRoute, { useValue: route }),
        ]);
      });
  }
}
