// RouterLink: an anchor that navigates the router instead of letting the browser follow its href.
// A relative destination is resolved against the route of the component the link sits in.

import { Directive, input, inject } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { Router } from "./router.ts";

@Directive({
  selector: "a[routerlink]",
  host: { "(click)": "navigateTo($event)" },
})
export class RouterLink {
  /** The destination: a path, or the segments of one, e.g. `"/todos"` or `["todos", "7"]`. */
  readonly routerlink = input<string | readonly string[] | undefined>(undefined);
  private readonly router = inject(Router);
  /** The activated route of the component this link sits in: a relative destination's base. */
  private readonly own = inject(ActivatedRoute);

  /** Navigates to the destination, and stops the browser from following the href. */
  private navigateTo(event: Event): void {
    event.preventDefault();
    const to = this.routerlink();
    if (to === undefined) {
      return;
    }
    this.router.navigate(to, { relativeTo: this.own });
  }
}
