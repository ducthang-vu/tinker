// RouterLink: an anchor that navigates the router instead of letting the browser follow its href.
// The link's URL is read by the injected URL builder: an absolute URL from the root, and a relative
// one from the route of the component the link sits in. A link that opens elsewhere (a target other
// than this tab, or a modifier or middle click) is left to the browser. The link is
// `aria-current="page"` while its path is the current one.

import { computed, Directive, input, inject } from "@tinker/core";
import { Router } from "../router/router.ts";
import { PLATFORM_LOCATION } from "../location/platform-location.ts";
import { UrlBuilder } from "../destination/url-builder.ts";
import { ActivatedRoute } from "../state/activated-route.ts";

/**
 * The path of a URL, without its query and hash.
 *
 * @param url A URL or path.
 * @returns The path part of the URL.
 */
function pathOf(url: string): string {
  return url.replace(/[?#].*$/, "");
}

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
  /** The URL: absolute, such as `"/todos/7"`, or relative, such as `"7"`, or its segments. */
  readonly routerlink = input<string | readonly string[] | undefined>(undefined);
  /** The browser's target, set on the link. `_blank` opens it in a new tab: left to the browser. */
  readonly target = input<string | undefined>(undefined);
  /** Query params set on the destination; a param is added to the query of the URL. */
  readonly queryParams = input<Readonly<Record<string, string>> | undefined>(undefined);
  /** The fragment (hash) of the destination, without the `#`. */
  readonly fragment = input<string | undefined>(undefined);
  /** The state of the history entry a click creates. */
  readonly state = input<unknown>(undefined);
  private readonly router = inject(Router);
  private readonly platform = inject(PLATFORM_LOCATION);
  private readonly urls = inject(UrlBuilder);
  /** The activated route of the component this link sits in: the base of a relative URL. */
  private readonly own = inject(ActivatedRoute);

  /** Where a click goes: the destination of the link, with its query params and fragment. */
  private readonly destination = computed(() => {
    const to = this.routerlink();
    if (to === undefined) {
      return undefined;
    }
    const url = typeof to === "string" ? to : to.join("/");
    const withQuery = Object.entries(this.queryParams() ?? {})
      .reduce((path, [name, value]) => path.withQuery(name, value), this.urls.relativeTo(this.own)
        .parse(url));
    const fragment = this.fragment();
    return (fragment === undefined ? withQuery : withQuery.withFragment(fragment)).build();
  });

  /** The URL a click navigates to, as the browser's app path: the href of the link. */
  private readonly href = computed(() => this.destination()
    ?.format());

  /** The href attribute: the app's href, in the browser's form when the platform has one. */
  private readonly attributeHref = computed(() => {
    const href = this.href();
    return href === undefined ? undefined : (this.platform.href?.(href) ?? href);
  });

  /** `page` while the link's path is the current one, for assistive technology. */
  private readonly ariaCurrent = computed(() => {
    const href = this.href();
    return href !== undefined && pathOf(href) === pathOf(this.router.url()) ? "page" : undefined;
  });

  /**
   * Navigates to the destination, and stops the browser from following the href. Only a plain
   * primary click reaches here (see the host listener). A link that targets another tab is left to
   * the browser.
   *
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
    void this.router.navigate(destination, { state: this.state() });
  }
}
