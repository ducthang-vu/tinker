// The navigation request: the value that moves through the pipeline. `navigate` builds the first
// one, and each redirect builds the next with the same id, and the URL it came from appended to
// `redirectFrom`, so the whole chain of redirects can be read from the request.

import type { Destination } from "../destination/url-builder.ts";
import type { LevelMatch } from "../router/match.ts";

/** A request to go to a URL. */
export interface NavigationRequest {
  /** The navigation this request belongs to. Every redirect keeps it. */
  readonly id: number;
  /** The absolute URL the request goes to. */
  readonly destination: Destination;
  /** The history state the URL is given. */
  readonly state: unknown;
  /** `push` adds a history entry (a `navigate` call); `pop` is a back or forward move. */
  readonly arrival: "push" | "pop";
  /**
   * The URLs this navigation was redirected from, oldest first. Empty for the first request. A
   * redirect appends the URL it came from, so the chain of redirects is readable from the request.
   */
  readonly redirectFrom: readonly Destination[];
}

/** A request whose URL matched a route: the levels it matched, root first. */
export interface MatchedRequest extends NavigationRequest {
  /** The levels the destination matches, root first. */
  readonly chain: readonly LevelMatch[];
}
