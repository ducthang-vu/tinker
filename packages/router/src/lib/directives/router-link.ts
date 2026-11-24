// RouterLink: an anchor that navigates the router instead of letting the browser follow its href.
// A relative destination is resolved against the route of the component the link sits in. A link
// that opens elsewhere (a target other than this tab, or a modifier or middle click) is left to the
// browser. The link is `aria-current="page"` while its path is the current one.

import { computed, Directive, input, inject } from "@tinker/core";
import { ActivatedRoute } from "../state/activated-route.ts";
import { Router } from "../router/router.ts";
import { PLATFORM_LOCATION } from "../location/platform-location.ts";
import { UrlBuilder } from "../router/url-builder.ts";

@Directive({
  selector: "a[routerlink]",
  host: {
    "(click.plain.primary)": "navigateTo($event)",
    "[attr.href]": "attributeHref()",
    "[attr.target]": "target()",
    "[attr.aria-current]": "ariaCurrent()",
  },
})
/** An anchor that navigates the router instead of following its href. */
export class RouterLink {
  /** The destination: a path, or the segments of one, e.g. `"/todos"` or `["todos", "7"]`. */
  readonly routerlink = input<string | readonly string[] | undefined>(undefined);
  /** The browser's target, set on the link. `_blank` opens it in a new tab: left to the browser. */
  readonly target = input<string | undefined>(undefined);
  /** Query params set on the destination; a param replaces the same key of its own query. */
  readonly queryParams = input<Readonly<Record<string, string>> | undefined>(undefined);
  /** The fragment (hash) of the destination, without the `#`. */
  readonly fragment = input<string | undefined>(undefined);
  /** The state of the history entry a click creates. */
  readonly state = input<unknown>(undefined);
  private readonly router = inject(Router);
  private readonly platform = inject(PLATFORM_LOCATION);
  /** The activated route of the component this link sits in: a relative destination's base. */
  private readonly own = inject(ActivatedRoute);
  /** Where a click goes: the destination, with its query params and fragment. */
  private readonly destination = computed(() => {
    const to = this.routerlink();
    return to === undefined
      ? undefined
      : UrlBuilder.from(to)
          .withQuery(this.queryParams() ?? {})
          .withFragment(this.fragment())
          .build();
  });

  /** The URL a click navigates to, resolved: the href of the link. */
  private readonly href = computed(() => {
    const destination = this.destination();
    return destination === undefined
      ? undefined
      : UrlBuilder.from(destination)
          .resolve(this.own.path)
          .build();
  });

  /** The href attribute: the app's href, in the browser's form when the platform has one. */
  private readonly attributeHref = computed(() => {
    const href = this.href();
    return href === undefined ? undefined : (this.platform.href?.(href) ?? href);
  });

  /** `page` while the link's path is the current one, for assistive technology. */
  private readonly ariaCurrent = computed(() => {
    const href = this.href();
    const current = UrlBuilder.from(this.router.url()).path;
    return href !== undefined && UrlBuilder.from(href).path === current
      ? "page"
      : undefined;
  });

  /**
   * Navigates to the destination, and stops the browser from following the href. Only a plain
   * primary click reaches here (see the host listener). A link that targets another tab is left to
   * the browser.
   * @param event
   * @param event The click event.
   */
  private navigateTo(event: MouseEvent): void {
    const target = this.target();
    if (target !== undefined && target !== "_self") {
      return;
    }
    event.preventDefault();
    const destination = this.destination();
    if (destination === undefined) {
      return;
    }
    this.router.navigate(destination, { relativeTo: this.own, state: this.state() });
  }
}
