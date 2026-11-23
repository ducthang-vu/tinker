// RouterOutlet: where the routed component is shown. It shows the activated route that its owner
// provides as ChildActivatedRoute. The token only changes when that route does, so the component is
// replaced exactly then.

import { computed, Directive, Effect, inject, provide, ViewContainerRef } from "@tinker/core";
import { ActivatedRoute } from "../state/activated-route.ts";
import { ChildActivatedRoute, nextAfter } from "../state/child-activated-route.ts";
import { Router } from "../router/router.ts";
import { componentOf } from "../router/route.ts";
import { Some, None, use, isEqual } from "@tinker/functional";

@Directive({ selector: "router-outlet" })
export class RouterOutlet {
  private readonly container = inject(ViewContainerRef);
  private readonly next = inject(ChildActivatedRoute);
  private readonly router = inject(Router);

  /** Shows the component of the next activated route, replacing the one shown. */
  @Effect() private show(): void {
    this.container.clear();
    use(this.next(), { Some: (route) => {
      // The component injects its own ActivatedRoute, which is the route it is shown for.
      this.container.createComponent(componentOf(route.route), this.container.length, [
        provide(ActivatedRoute, { useValue: route }),
        provide(ChildActivatedRoute, {
          useValue: computed(
            () => nextAfter(this.router.activated(), route),
            (a, b) => isEqual(a, b),
          ),
        }),
      ]);
    }, None: () => undefined });
  }
}
