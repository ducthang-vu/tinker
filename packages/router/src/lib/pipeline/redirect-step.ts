// The redirect step: asks the matched routes, root first, whether to send the navigation elsewhere.
// Each route's `redirect` runs in the injection context of the router, so it can `inject`. The
// first one that returns a URL decides. A throw stops the navigation with a Failed.

import { type Injector, runInInjectionContext } from "@tinker/core";
import { Left, Right } from "@tinker/functional";
import type { MatchedRequest } from "./request.ts";
import type { RedirectStep } from "./steps.ts";
import { failed, Redirect, type Stop } from "./stop.ts";

/**
 * The redirect step for a router with `injector`.
 *
 * @param injector The injector whose context the routes' redirects run in.
 * @returns A redirect step: a Redirect stop for the first route that redirects, or the request.
 */
export function createRedirectStep(injector: Injector): RedirectStep {
  return (matched) => {
    try {
      const target = matched.chain.reduce<string | undefined>(
        (found, level) =>
          found ?? runInInjectionContext(injector, () => level.route.redirect?.(matched)),
        undefined,
      );
      return target === undefined
        ? Right.of<MatchedRequest, Stop>(matched)
        : Left.of<Stop, MatchedRequest>(Redirect.of(matched, target));
    } catch (cause) {
      return Left.of<Stop, MatchedRequest>(failed(matched, cause));
    }
  };
}
