// RouterLink: an anchor that navigates the router instead of letting the browser follow its href.
// A relative destination is resolved against the route of the component the link sits in. A link
// that opens elsewhere (a target other than this tab, or a modifier or middle click) is left to the
// browser.

import { Directive, input, inject } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { Router } from "./router.ts";

@Directive({
  selector: "a[routerlink]",
  host: { "(click)": "navigateTo($event)", "[attr.target]": "target()" },
})
export class RouterLink {
  /** The destination: a path, or the segments of one, e.g. `"/todos"` or `["todos", "7"]`. */
  readonly routerlink = input<string | readonly string[] | undefined>(undefined);
  /** The browser's target, set on the link. `_blank` opens it in a new tab: left to the browser. */
  readonly target = input<string | undefined>(undefined);
  private readonly router = inject(Router);
  /** The activated route of the component this link sits in: a relative destination's base. */
  private readonly own = inject(ActivatedRoute);

  /** Navigates to the destination, and stops the browser from following the href. */
  private navigateTo(event: MouseEvent): void {
    if (this.opensElsewhere(event)) {
      return;
    }
    event.preventDefault();
    const to = this.routerlink();
    if (to === undefined) {
      return;
    }
    this.router.navigate(to, { relativeTo: this.own });
  }

  /** Whether the click asks the browser to open the link elsewhere: a target, or a modifier. */
  private opensElsewhere(event: MouseEvent): boolean {
    const target = this.target();
    return (target !== undefined && target !== "_self")
      || event.button !== 0
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || event.altKey;
  }
}
