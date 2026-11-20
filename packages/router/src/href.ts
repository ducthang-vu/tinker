// The href of a routerlink: the URL a click on the link navigates to, so the href and the click
// agree. The destination is resolved against the path of the route the link sits in (see
// resolveUrl). Nothing to link to gives undefined.

import { resolveUrl } from "./resolve-url.ts";

export function hrefOf(
  to: string | readonly string[] | undefined,
  base: readonly string[],
): string | undefined {
  if (to === undefined) {
    return undefined;
  }
  return resolveUrl(typeof to === "string" ? to : to.join("/"), base);
}
