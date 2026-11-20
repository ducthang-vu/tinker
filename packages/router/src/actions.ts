// The actions of a navigation. Every step the router takes is dispatched as an action with its
// payload, in a fixed order, so a subscriber can follow a navigation from start to end:
//
//   NAVIGATION_START   the navigation begins: its URL, state and kind (push or back/forward)
//   MATCH_ROUTE        the URL is matched against the route tree
//   REDIRECT_ROUTE     a route or a guard sends the navigation to another URL (only when it does)
//   GUARD_ROUTE        the guards of one matched route run, in root-first order
//   BROWSER_NAVIGATION the history entry is pushed, replaced or restored, and the routes update
//                      (only when the browser changes)
//   NAVIGATION_END     the navigation ends: committed, failed or cancelled
//
// Each action has a status. A success carries its payload. A failure is dispatched as the action
// that failed: its type names the step, its payload is what the step was given, and its `error`
// says why. Every action of one navigation carries the same `navigationId`, and `sequence` numbers
// them from 1 in the order they happened.

import { Task } from "@tinker/core";

/** The payload of each action: what the step works on, and what it decided. */
export interface ActionPayloads {
  readonly NAVIGATION_START: {
    readonly url: string;
    readonly state: unknown;
    readonly arrival: "push" | "current";
  };
  readonly MATCH_ROUTE: { readonly url: string };
  readonly REDIRECT_ROUTE: {
    /** The URL the redirect was decided for. */
    readonly url: string;
    /** The URL the navigation goes to instead. */
    readonly target: string;
    /** Whether a route's `redirect` or a guard's result decided it. */
    readonly by: "route" | "guard";
  };
  readonly GUARD_ROUTE: {
    readonly url: string;
    /** The path of the route whose guards ran. */
    readonly route: string;
    /** What the route's guards decided, on success: `true`, or a URL to redirect to. */
    readonly verdict?: true | string;
  };
  readonly BROWSER_NAVIGATION: {
    readonly url: string;
    readonly state: unknown;
    /**
     * `push` adds an entry, `replace` changes the current one, `none` leaves it, and `restore` puts
     * back the last committed URL.
     */
    readonly step: "push" | "replace" | "none" | "restore";
  };
  readonly NAVIGATION_END: { readonly url: string };
}

/** The type of an action: the step it names. */
export type ActionType = keyof ActionPayloads;

/** One dispatched action of a navigation. */
export type NavigationAction = {
  [T in ActionType]: {
    readonly type: T;
    /** The navigation this action belongs to: one number per navigation, counted from 1. */
    readonly navigationId: number;
    /** The position of this action in its navigation, counted from 1. */
    readonly sequence: number;
    readonly payload: ActionPayloads[T];
  } & (
    | { readonly status: "success" }
    | { readonly status: "error"; readonly error: unknown }
  );
}[ActionType];

/**
 * The actions of one navigation: numbers them, and hands each one to `dispatch`. The router makes
 * one per navigation.
 */
export class NavigationTrace {
  private sequence = 0;

  private constructor(
    /** The number of this navigation. */
    readonly id: number,
    private readonly dispatch: (action: NavigationAction) => void,
  ) {}

  static of(id: number, dispatch: (action: NavigationAction) => void): NavigationTrace {
    return new NavigationTrace(id, dispatch);
  }

  /** Dispatches a successful action of `type`, with `payload`. */
  success<T extends ActionType>(type: T, payload: ActionPayloads[T]): void {
    this.dispatch({
      type,
      navigationId: this.id,
      sequence: ++this.sequence,
      payload,
      status: "success",
    } as NavigationAction);
  }

  /** Dispatches a failed action of `type`: the step that failed, with its payload and `error`. */
  failure<T extends ActionType>(type: T, payload: ActionPayloads[T], error: unknown): void {
    this.dispatch({
      type,
      navigationId: this.id,
      sequence: ++this.sequence,
      payload,
      status: "error",
      error,
    } as NavigationAction);
  }

  /**
   * The task `task`, with its action dispatched when it settles: a success with `payload`, or with
   * `onSuccess(value)` when given, and a failure with `payload` and the error. The outcome is
   * passed on unchanged.
   */
  observe<T extends ActionType, V, E>(
    type: T,
    payload: ActionPayloads[T],
    task: Task<V, E>,
    onSuccess?: (value: V) => ActionPayloads[T],
  ): Task<V, E | Error> {
    return Task.from<V, E>((ok, error) =>
      task.run({
        ok: (value) => {
          this.success(type, onSuccess === undefined ? payload : onSuccess(value));
          ok(value);
        },
        error: (cause) => {
          this.failure(type, payload, cause);
          error(cause);
        },
      }));
  }
}
