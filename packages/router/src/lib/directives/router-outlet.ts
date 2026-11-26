// RouterOutlet: where the routed component is shown. It shows the route that its owner provides
// as NextRouteWithComponent. The token only changes when that route does, so the component is
// replaced exactly then.

import { computed, Directive, Effect, inject, provide, ViewContainerRef } from "@tinker/core";
import { ActivatedRoute } from "../state/activated-route.ts";
import { NextRouteWithComponent, shownAfter } from "../state/next-route-with-component.ts";
import { Router } from "../router/router.ts";
import { componentOf } from "../router/route.ts";
import { None, use, isEqual } from "@tinker/functional";

@Directive({ selector: "router-outlet" })
/** Shows the component of the active route, where the outlet is placed. */
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  private readonly shown = inject(NextRouteWithComponent);
  private readonly router = inject(Router);

  /** Shows the component of the route to show, replacing the one shown. */
  @Effect() private show(): void {
    this.container.clear();
    use(this.shown(), { Some: (route) => {
      // The component injects its own ActivatedRoute, which is the route it is shown for.
      this.container.createComponent(componentOf(route.route), this.container.length, [
        provide(ActivatedRoute, { useValue: route }),
        provide(NextRouteWithComponent, {
          useValue: computed(
            () => shownAfter(this.router.activated(), route),
            (a, b) => isEqual(a, b),
          ),
        }),
      ]);
    }, None: () => undefined });
  }
}
