// RouterOutlet: where the routed component is shown. It shows the activated route that its owner
// provides as ChildActivatedRoute. The token only changes when that route does, so the component is
// replaced exactly then.

import { computed, Directive, Effect, inject, provide, ViewContainerRef } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { ChildActivatedRoute, nextAfter } from "./child-activated-route.ts";
import { Router } from "./router.ts";

@Directive({ selector: "router-outlet" })
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  // Looked up in the owner component only: an outlet that its owner does not provide fails.
  private readonly next = inject(ChildActivatedRoute, { host: true });
  private readonly router = inject(Router);

  /** Shows the component of the next activated route, replacing the one shown. */
  @Effect() private show(): void {
    this.container.clear();
    this.next()
      .ifSome((route) => {
      // The component injects its own ActivatedRoute, which is the route it is shown for.
        this.container.createComponent(route.route.component, this.container.length, [
          provide(ActivatedRoute, { useValue: route }),
          provide(ChildActivatedRoute, {
            useValue: computed(
              () => nextAfter(this.router.activated(), route),
              (a, b) => a.isEqual(b),
            ),
          }),
        ]);
      });
  }
}
