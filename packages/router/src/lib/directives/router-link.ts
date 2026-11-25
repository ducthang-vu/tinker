// RouterLink: an anchor that navigates the router instead of letting the browser follow its href.
// The link's URL is read by the injected URL builder: an absolute URL from the root, and a relative
// one from the route of the component the link sits in. A link that opens elsewhere (a target other
// than this tab, or a modifier or middle click) is left to the browser. The link is
// `aria-current="page"` while its path is the current one.

import { computed, Directive, input, inject } from "@tinker/core";
import { Router } from "../router/router.ts";
import { Location } from "../location/location.ts";
import { AppPathBuilder } from "../destination/app-path-builder.ts";
import { ActivatedRoute } from "../state/activated-route.ts";

/**
 * The query pairs of a URL that a link keeps.
 *
 * @param query The query of the URL.
 * @param preserve `"none"`, `"all"`, or the keys to keep.
 * @returns The kept pairs, by name.
 */
function keptQuery(
  query: URLSearchParams,
  preserve: "none" | "all" | readonly string[],
): Record<string, string> {
  if (preserve === "none") {
    return {};
  }
  const pairs = [...query.entries()];
  return Object.fromEntries(preserve === "all" ? pairs : pairs.filter(([name]) => preserve.includes(name)));
}

/**
 * Splits a text at the first `separator`: the part before it, and the part after, if there is one.
 *
 * @param text The text to split.
 * @param separator The character to split at.
 * @returns The part before the separator, and the part after it, or undefined when there is none.
 */
function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

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
  providers: [AppPathBuilder],
  host: {
    "(click.plain.primary)": "navigateTo($event)",
    "[attr.href]": "attributeHref()",
    "[attr.target]": "target()",
    "[attr.aria-current]": "ariaCurrent()",
  },
})
/**
 * An anchor that navigates the router instead of following its href. A click navigates the router
 * to the link's destination, and the browser does not follow the href. The `href` shows the same
 * URL with the app's folder added, so the link also works without the router.
 *
 * @example
 * ```html
 * <a routerlink="/todos/7" [queryParams]="{ tab: 'done' }">Todo 7</a>
 * <!-- href="/todos/7?tab=done" -->
 * ```
 */
export class RouterLink {
  /**
   * The URL the link goes to: absolute (`"/todos/7"`), relative to the component the link is in
   * (`"7"`), or a list of segments (`["todos", "7"]`, joined with `/`). A URL that no route takes
   * makes the link throw when it is rendered.
   *
   * @example
   * ```html
   * <a routerlink="/todos">All todos</a>
   * <a [routerlink]="['todos', id]">Todo {{ id }}</a>
   * ```
   */
  readonly routerlink = input<string | readonly string[] | undefined>(undefined);
  /**
   * The browser target of the link. `_self`, or no target, navigates in this tab. Any other target,
   * such as `_blank`, is left to the browser, and the router does not navigate.
   *
   * @example
   * ```html
   * <a routerlink="/todos" target="_blank">Open in a new tab</a>
   * ```
   */
  readonly target = input<string | undefined>(undefined);
  /**
   * Query pairs added to the link's URL. They override the URL's pairs with the same name, and
   * `preserveQueryParams` decides which of the URL's other pairs are kept.
   *
   * @example
   * ```html
   * <a routerlink="/todos" [queryParams]="{ sort: 'due' }">By due date</a>
   * <!-- href="/todos?sort=due" -->
   * ```
   */
  readonly queryParams = input<Readonly<Record<string, string>> | undefined>(undefined);
  /**
   * Which of the URL's own query pairs are kept, before `queryParams` are added. `"none"` (the
   * default) keeps none of them. `"all"` keeps them all. A list keeps only the names it gives.
   *
   * @example
   * ```html
   * <a routerlink="/todos?x=1&sort=due" [queryParams]="{ tab: 'done' }">Done</a>
   * <!-- href="/todos?tab=done" -->
   * <a routerlink="/todos?x=1&sort=due" [queryParams]="{ tab: 'done' }"
   *    [preserveQueryParams]="['sort']">Done, sorted</a>
   * <!-- href="/todos?sort=due&tab=done" -->
   * ```
   */
  readonly preserveQueryParams = input<"none" | "all" | readonly string[]>("none");
  /**
   * The fragment (the part after `#`) of the link's URL, without the `#`. When it is not set, the
   * fragment in `routerlink` is used.
   *
   * @example
   * ```html
   * <a routerlink="/todos/7" fragment="comments">Comments</a>
   * <!-- href="/todos/7#comments" -->
   * ```
   */
  readonly fragment = input<string | undefined>(undefined);
  /**
   * The history state a click creates for the navigation.
   *
   * @example
   * ```html
   * <a routerlink="/todos" [state]="{ scroll: 320 }">Back to the list</a>
   * ```
   */
  readonly state = input<unknown>(undefined);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  /** The activated route of the component this link sits in: the base of a relative URL. */
  private readonly own = inject(ActivatedRoute);
  /** The builder of this link: a relative URL starts at the route the link sits in. */
  private readonly builder = inject(AppPathBuilder);

  /** Where a click goes: the destination of the link, with its query params and fragment. */
  private readonly destination = computed(() => {
    const to = this.routerlink();
    if (to === undefined) {
      return undefined;
    }
    const url = typeof to === "string" ? to : to.join("/");
    const [beforeHash, hash] = splitOnce(url, "#");
    const [pathOnly, search] = splitOnce(beforeHash, "?");
    const kept = keptQuery(new URLSearchParams(search ?? ""), this.preserveQueryParams());
    const path = this.builder.relativeTo()
      .parse(pathOnly)
      .withQuery({ ...kept, ...(this.queryParams() ?? {}) });
    const fragment = this.fragment() ?? (hash === undefined ? undefined : decodeURIComponent(hash));
    return (fragment === undefined ? path : path.withFragment(fragment)).build();
  });

  /** The URL a click navigates to, as the browser's app path: the href of the link. */
  private readonly href = computed(() => this.destination()
    ?.format());

  /** The href attribute: the app's href, in the browser's form when the platform has one. */
  private readonly attributeHref = computed(() => {
    const href = this.href();
    return href === undefined ? undefined : this.location.buildBrowserUrl(href);
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
