// The navigation request: the value that moves through the pipeline. `navigate` builds the first
// one, and each redirect builds the next with the same id, and the URL it came from appended to
// `redirectFrom`, so the whole chain of redirects can be read from the request.

import type { AppPath } from "../destination/app-path.ts";
import type { LevelMatch } from "../router/match.ts";
import type { ActivatedRoute } from "../state/activated-route.ts";
import type { TraceEntry } from "./trace.ts";

/** A request to go to a URL. */
export interface NavigationRequest {
  /** The navigation this request belongs to. Every redirect keeps it. */
  readonly id: number;
  /** The absolute URL the request goes to. */
  readonly destination: AppPath;
  /** The history state the URL is given. */
  readonly state: unknown;
  /**
   * `push` adds a history entry (a `navigate` call); `pop` is a back or forward move; `start` is
   * the URL the app starts at, which replaces the entry it is already on.
   */
  readonly arrival: "push" | "pop" | "start";
  /**
   * The URLs this navigation was redirected from, oldest first. Empty for the first request. A
   * redirect appends the URL it came from, so the chain of redirects is readable from the request.
   */
  readonly redirectFrom: readonly AppPath[];
  /**
   * The activated routes this navigation leaves, root first. Set when the navigation starts, from
   * the committed chain. Deactivate guards read them, from the last to the first.
   */
  readonly activatedRoutes: readonly ActivatedRoute[];
  /**
   * What each step did to this navigation, in order: the guards' commands and the redirects. For
   * debugging: the app does not act on it.
   */
  readonly trace: readonly TraceEntry[];
}

/** A request whose URL matched a route: the levels it matched, root first. */
export interface MatchedRequest extends NavigationRequest {
  /** The levels the destination matches, root first. */
  readonly chain: readonly LevelMatch[];
}
