// The trace of a navigation: what each step did to it, in order. It is for debugging; the app does
// not act on it. A guard writes the source of the guard and the command it returned; a redirect
// writes the URL it sends the navigation to.

import type { RouteGuardCommand } from "./guard-step.ts";

/** A guard's entry: which guard was asked, on which route, and the command it returned. */
export interface GuardTrace {
  /** The source of the guard. */
  readonly step: "ACTIVATE_GUARD" | "DEACTIVATE_GUARD";
  /** The path of the route whose guard was asked. */
  readonly route: string;
  /** The command the guard returned. */
  readonly command: RouteGuardCommand["type"];
}

/** A redirect's entry: the URL the navigation was redirected to. */
export interface RedirectTrace {
  /** The step that redirected. */
  readonly step: "REDIRECT";
  /** The URL the navigation goes to instead. */
  readonly to: string;
}

/** One entry of the trace of a navigation. */
export type TraceEntry = GuardTrace | RedirectTrace;
