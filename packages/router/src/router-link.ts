// RouterLink: an anchor that navigates the router instead of letting the browser follow its href.
// A relative destination is resolved against the route of the component the link sits in. A link
// that opens elsewhere (a target other than this tab, or a modifier or middle click) is left to the
// browser.

import { computed, Directive, input, inject } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { hrefOf } from "./href.ts";
import { pathOf } from "./resolve-url.ts";
import { Router } from "./router.ts";

@Directive({
  selector: "a[routerlink]",
  host: { "(click.plain)": "navigateTo($event)", "[attr.href]": "href()", "[attr.target]": "target()" },
})
export class RouterLink {
  /** The destination: a path, or the segments of one, e.g. `"/todos"` or `["todos", "7"]`. */
  readonly routerlink = input<string | readonly string[] | undefined>(undefined);
  /** The browser's target, set on the link. `_blank` opens it in a new tab: left to the browser. */
  readonly target = input<string | undefined>(undefined);
  private readonly router = inject(Router);
  /** The activated route of the component this link sits in: a relative destination's base. */
  private readonly own = inject(ActivatedRoute);
  /** The URL a click navigates to: the href of the link. */
  private readonly href = computed(() => hrefOf(this.routerlink(), pathOf(this.own)));

  /**
   * Navigates to the destination, and stops the browser from following the href. A plain click
   * only reaches here (see the host listener). A link that opens elsewhere, or a middle click, is
   * left to the browser.
   */
  private navigateTo(event: MouseEvent): void {
    const target = this.target();
    if ((target !== undefined && target !== "_self") || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const to = this.routerlink();
    if (to === undefined) {
      return;
    }
    this.router.navigate(to, { relativeTo: this.own });
  }
}
