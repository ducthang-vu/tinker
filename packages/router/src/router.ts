// The router: the current URL, the matched route and params, the list of activated routes, and
// `navigate`. It reads and writes the URL through Location, so it follows back and forward moves.
//
// A navigation runs the pipeline in pipeline.ts before it changes anything: the guards decide, and
// only a plan that passes is committed (the URL and the activated routes). Every step is dispatched
// as an action (see actions.ts), available on `actions`. Back and forward moves run the same
// pipeline after the browser has moved; when one is rejected, the router puts the previous URL
// back. A newer navigation cancels the one running.

import {
  computed,
  Either,
  Emitter,
  inject,
  Injector,
  Maybe,
  type ReadonlySignal,
  signal,
  Stream,
  untracked,
  watch,
  type Runnable,
} from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import { type NavigationAction, NavigationTrace } from "./actions.ts";
import { activatedFor } from "./activation.ts";
import type { Location } from "./location.ts";
import { matchRoute, type RouteMatch } from "./match.ts";
import {
  NavigationCancelledError,
  type NavigationError,
  type NavigationResult,
} from "./navigation.ts";
import { type Plan, type Outcome, planNavigation } from "./pipeline.ts";
import type { Route } from "./route.ts";
import { UrlBuilder } from "./url-builder.ts";

/** The options of `navigate`. */
export interface NavigateOptions {
  /** The state of the new history entry, `null` when none is given. */
  readonly state?: unknown;
  /** The activated route that a relative URL is resolved against. */
  readonly relativeTo?: ActivatedRoute;
}

/**
 * How a navigation reaches the browser: `"push"` adds a history entry when it commits, and
 * `"current"` is a back or forward move, where the browser already shows the URL.
 */
type Arrival = "push" | "current";

/** A navigation that is running, until it commits, fails, or a newer one replaces it. */
interface Running {
  readonly url: string;
  readonly trace: NavigationTrace;
  readonly settle: (result: NavigationResult) => void;
  /** Stops the step that is waiting. */
  readonly cancel: () => void;
}

/** The URL and state of the history entry the router last committed. */
interface Committed {
  readonly url: string;
  readonly state: unknown;
}

/** Runs a watch at once: the activated routes follow the URL as soon as it changes. */
const immediately = { schedule: (task: Runnable) => task.run() };

export class Router {
  /** The current URL: path, query and hash. */
  readonly url: ReadonlySignal<string>;
  /** The route that matches the current URL and its params, or undefined when none does. */
  readonly match: ReadonlySignal<RouteMatch | undefined>;
  /** The activated routes for the current URL, root first. The first one never changes. */
  readonly activated: ReadonlySignal<readonly ActivatedRoute[]>;
  /** The activated route of the root: the first of the list, which never changes. */
  readonly rootRoute: ActivatedRoute;
  /**
   * Every action the router dispatches, in order, each with its navigation's number. A subscriber
   * sees the actions from the moment it subscribes. The first navigation runs when the router is
   * created, so it is not seen by a subscriber made later.
   */
  readonly actions: Stream<NavigationAction>;
  private readonly emitter = Emitter.create<NavigationAction>();
  private readonly root: Route;
  private readonly location: Location;
  private readonly injector = inject(Injector);
  private readonly list = signal<readonly ActivatedRoute[]>([]);
  private running: Maybe<Running> = Maybe.none();
  private committed: Maybe<Committed> = Maybe.none();
  private lastNavigationId = 0;
  /**
   * True while the router itself moves the browser, so that the move is not taken for a back or
   * forward.
   */
  private changingBrowser = false;

  constructor(root: Route, location: Location) {
    this.root = root;
    this.location = location;
    this.url = location.url;
    this.rootRoute = new ActivatedRoute(root, {}, [], Maybe.none());
    this.match = computed(() => matchRoute(root, location.url()));
    this.activated = this.list;
    this.actions = this.emitter.stream;
    this.list.set([this.rootRoute]);
    watch(() => {
      const url = location.url();
      untracked(() => {
        // A change the router made itself is not a back or forward move. Nor is a change to the URL
        // the router has already committed: a restore moves the browser back there, and the watch
        // may run again once the restore has finished.
        if (!this.changingBrowser && url !== this.committedUrl()) {
          void this.start(url, location.state(), "current");
        }
      });
    }, immediately);
  }

  /**
   * Go to `url` as a new history entry, with `options.state`, once its guards pass.
   * `url` is a URL, or the segments of one: `["todos", "7"]` is `"todos/7"`, and the query and hash
   * then go in the last segment. A relative URL is resolved against the path of
   * `options.relativeTo` (the root when none is given); see `UrlBuilder.resolve`.
   *
   * The result is a promise of the outcome, and it settles later when a guard is asynchronous. With
   * synchronous guards the URL has changed by the time `navigate` returns. A navigation that is
   * rejected, fails, or is cancelled by a newer one leaves the URL as it was. A URL no route
   * matches is a `NoRouteError`: declare a `**` route to catch those.
   */
  navigate(
    url: string | readonly string[],
    options: NavigateOptions = {},
  ): Promise<NavigationResult> {
    const base = Maybe.from(options.relativeTo)
      .match({
        some: (route) => route.path,
        none: () => [],
      });
    const target = UrlBuilder.from(url)
      .resolve(base)
      .build();
    return this.start(target, options.state ?? null, "push");
  }

  /**
   * Runs the pipeline for `url`, and settles with its outcome. A running navigation is cancelled
   * first. The navigation's actions are numbered with a new navigation id.
   */
  private start(url: string, state: unknown, arrival: Arrival): Promise<NavigationResult> {
    return new Promise((settle) => {
      this.cancelRunning();
      this.lastNavigationId += 1;
      const trace = NavigationTrace.of(this.lastNavigationId, (action) =>
        this.emitter.emit(action));
      trace.success("NAVIGATION_START", { url, state, arrival });
      let done = false;
      const cancel = this.plan(url, state, trace)
        .run({
          ok: (plan) => {
            done = true;
            this.running = Maybe.none();
            this.conclude(trace, arrival, url, settle, this.commit(plan, arrival, trace));
          },
          error: (error) => {
            done = true;
            this.running = Maybe.none();
            this.conclude(trace, arrival, url, settle, Either.left(error));
          },
        });
      // Only a navigation still waiting for a guard can be cancelled by a newer one.
      if (!done) {
        this.running = Maybe.some({ url, trace, settle, cancel });
      }
    });
  }

  /**
   * Ends a navigation: its END action, and its result. A failure puts the browser back first, when
   * a back or forward move had changed it.
   */
  private conclude(
    trace: NavigationTrace,
    arrival: Arrival,
    url: string,
    settle: (result: NavigationResult) => void,
    result: NavigationResult,
  ): void {
    result.match({
      left: (error) => {
        this.restore(arrival, trace);
        trace.failure("NAVIGATION_END", { url }, error);
      },
      right: () => {
        trace.success("NAVIGATION_END", { url });
      },
    });
    settle(result);
  }

  /** Stops the running navigation, if any: it ends as cancelled, and changes nothing. */
  private cancelRunning(): void {
    this.running.ifSome((running) => {
      this.running = Maybe.none();
      running.cancel();
      const error = new NavigationCancelledError(running.url);
      running.trace.failure("NAVIGATION_END", { url: running.url }, error);
      running.settle(Either.left(error));
    });
  }

  /** The URL the router last committed, or `undefined` before the first navigation commits. */
  private committedUrl(): string | undefined {
    return this.committed.match({
      some: (entry) => entry.url,
      none: () => undefined,
    });
  }

  private plan(url: string, state: unknown, trace: NavigationTrace): Outcome<Plan> {
    return planNavigation(
      {
        root: this.root,
        injector: this.injector,
        activated: untracked(() => this.list()),
        from: this.committed.match({
          some: (entry) => entry.url,
          none: () => "",
        }),
        trace,
      },
      url,
      state,
    );
  }

  /**
   * Makes a plan the current navigation: the browser shows its URL, and its routes are activated.
   * The browser step is dispatched as BROWSER_NAVIGATION, with its failure if the browser refuses.
   */
  private commit(plan: Plan, arrival: Arrival, trace: NavigationTrace): NavigationResult {
    const step = arrival === "push"
      ? "push"
      : plan.url === this.location.url() ? "none" : "replace";
    const payload = { url: plan.url, state: plan.state, step } as const;
    const moved = Either.from(() =>
      this.changeBrowser(() => {
        if (step === "push") {
          this.location.go(plan.url, plan.state);
        } else if (step === "replace") {
          this.location.replace(plan.url, plan.state);
        }
      }));
    return moved.match<NavigationResult>({
      left: (error) => {
        trace.failure("BROWSER_NAVIGATION", payload, error);
        return Either.left(error);
      },
      right: () => {
        trace.success("BROWSER_NAVIGATION", payload);
        this.committed = Maybe.some({ url: plan.url, state: plan.state });
        this.list.set(activatedFor(this.rootRoute, plan.kept, plan.chain.slice(1)));
        return Either.right(undefined);
      },
    });
  }

  /**
   * After a back or forward move that did not commit, shows the URL the router was at again, as a
   * BROWSER_NAVIGATION action with the step "restore".
   */
  private restore(arrival: Arrival, trace: NavigationTrace): void {
    if (arrival === "current") {
      this.committed.ifSome(({ url, state }) => {
        const payload = { url, state, step: "restore" } as const;
        Either.from(() => this.changeBrowser(() => this.location.replace(url, state)))
          .match({
            left: (error) => {
              trace.failure("BROWSER_NAVIGATION", payload, error);
            },
            right: () => {
              trace.success("BROWSER_NAVIGATION", payload);
            },
          });
      });
    }
  }

  private changeBrowser(change: () => void): void {
    const was = this.changingBrowser;
    this.changingBrowser = true;
    try {
      change();
    } finally {
      this.changingBrowser = was;
    }
  }
}
