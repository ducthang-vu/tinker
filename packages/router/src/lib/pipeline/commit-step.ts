// The commit step: the last step of the pipeline. A push adds a history entry. A pop replaces the
// current entry with the destination, since the browser has already moved. Then the activated
// routes are updated, so a committed navigation always has its routes in place.

import { fromComputation, type Task } from "@tinker/functional";
import { toBrowserUrl } from "../destination/app-base.ts";
import type { MatchedRequest } from "./request.ts";
import type { CommitStep } from "./steps.ts";
import { failed, type Stop } from "./stop.ts";

/** The browser, as the commit step writes to it: the URL, and the two ways to change it. */
export interface BrowserWriter {
  /** Add a history entry for `url`, with `state`. */
  go(url: string, state: unknown): void;
  /** Replace the current entry with `url`, with `state`. */
  replace(url: string, state: unknown): void;
}

/** What the commit step needs: the browser, the app's base, and how to activate the routes. */
export interface CommitOptions {
  /** The browser the commit writes to. */
  readonly browser: BrowserWriter;
  /** The base the app is served under, added to the destination's URL. */
  readonly base: string;
  /** Updates the activated routes to the matched levels. */
  readonly activate: (matched: MatchedRequest) => void;
}

/**
 * The commit step for a router.
 *
 * @param options The browser, the base, and the activation.
 * @returns A commit step: succeeds with the navigation once it is committed, or stops with Failed.
 */
export function createCommitStep(options: CommitOptions): CommitStep {
  return (matched): Task<MatchedRequest, Stop> =>
    fromComputation<MatchedRequest, Stop>((ok, error) => {
      try {
        const target = toBrowserUrl(matched.destination, options.base);
        if (matched.arrival === "push") {
          options.browser.go(target, matched.state);
        } else {
          // The browser has already moved on a back or forward move, so the entry is replaced with
          // the destination, whether or not it differs from the last committed URL.
          options.browser.replace(target, matched.state);
        }
        options.activate(matched);
        ok(matched);
      } catch (cause) {
        error(failed(matched, cause));
      }
    });
}
