// A resource: a value loaded by a loader, with its state, its last error, and when it last
// changed. Reading it never throws: a failed load changes `error` and `state`, and `value`
// keeps the last success (or the default, until there is one).
//
//   const user = resource((signal) => fetch(`/users/${id()}`, { signal }).then((r) => r.json()),
//     { default: emptyUser });
//   user.value()    // the default until the first success, then the last success
//   user.state()    // "loading" | "fetched" | "failed" | "written" (and "idle" when lazy)
//
// The loader's reads are tracked: when a signal it read changes, it runs again, and the run
// in progress is aborted through its AbortSignal, so an older result cannot overwrite a newer
// one. A loader returns a promise or a Task; a Task's cancellation runs when it is superseded.
// A loader that returns `undefined` skips the load: nothing runs, and the state is "idle".

import { signal, untracked, watch, type ReadonlySignal, type Runnable, type Watch } from "../signals/index.ts";
import { run, Stream, type Task, use, Left, Right, type Either } from "@tinker/functional";

/** What the resource is doing, or what it last did. */
export type ResourceState = "idle" | "loading" | "fetched" | "failed" | "written";

/**
 * Runs the load: its reads are tracked, and it returns a promise or a task of the value. Returning
 * `undefined` skips the load: the value is kept and the state is "idle".
 */
export type Loader<T, E> = (signal: AbortSignal) => PromiseLike<T> | Task<T, E> | undefined;

export interface ResourceOptions<T> {
  /** The value before the first success. */
  readonly default: T;
  /** Whether the loader waits for the first `reload()` instead of running at creation. */
  readonly lazy?: boolean;
}

export interface Resource<T, E = Error> {
  /** What the resource is doing, or what it last did. */
  readonly state: ReadonlySignal<ResourceState>;
  /** The last success, or the default until there is one. */
  readonly value: ReadonlySignal<T>;
  /** The last failure, cleared by a success or a write. */
  readonly error: ReadonlySignal<E | undefined>;
  /** Whether a load or a write has ever supplied the value. False while `value` is the default. */
  readonly sourced: ReadonlySignal<boolean>;
  /** When the value last changed by a success or a write. Undefined until then. */
  readonly lastUpdated: ReadonlySignal<Date | undefined>;
  /** Write a value without loading it: aborts the run in progress, and state becomes "written". */
  set(value: T): void;
  /** Run the loader again, aborting the run in progress. */
  reload(): void;
}

/** A failure as an Error: an Error is kept, anything else is wrapped. */
function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Runs a watch's work at once: the resource's re-runs are synchronous, as its writes are. */
const immediately = { schedule: (task: Runnable) => task.run() };

/** The argument of a loader in the trigger form: the trigger request, and the signal. */
export interface LoaderArgs<P> {
  /** What the trigger returned. Never undefined: an undefined request skips the load. */
  readonly params: P;
  /** Aborted when this run is superseded, so the loader can stop its work. Optional to use. */
  readonly abortSignal: AbortSignal;
}

/**
 * A resource with a trigger and a loader. The trigger reads the signals and returns the request
 * as `params`, or `undefined` to skip the load before anything runs. The loader gets the request
 * and reads no signals: a change to what the trigger reads starts a new load.
 */
export function resource<T, E = Error, P = unknown>(
  trigger: () => { readonly params: P } | undefined,
  loader: (args: LoaderArgs<P>) => PromiseLike<T> | Task<T, E>,
  options: ResourceOptions<T>,
): Resource<T, E>;
/** A resource whose loader reads the signals it needs: a change to any starts a new load. */
export function resource<T, E = Error>(
  loader: Loader<T, E>,
  options: ResourceOptions<T>,
): Resource<T, E>;
export function resource<T, E = Error, P = unknown>(
  first: Loader<T, E> | (() => { readonly params: P } | undefined),
  second: ResourceOptions<T> | ((args: LoaderArgs<P>) => PromiseLike<T> | Task<T, E>),
  third?: ResourceOptions<T>,
): Resource<T, E> {
  if (third === undefined) {
    return fromLoader(first as Loader<T, E>, second as ResourceOptions<T>);
  }
  const trigger = first as () => { readonly params: P } | undefined;
  const loader = second as (args: LoaderArgs<P>) => PromiseLike<T> | Task<T, E>;
  return fromLoader((abortSignal) => {
    // Read by the watch that runs the loader, so a change to what it reads starts a new load.
    const request = trigger();
    return request === undefined
      ? undefined
      : untracked(() => loader({ params: request.params, abortSignal }));
  }, third);
}

/** The resource of a loader, which reads the signals it needs. */
function fromLoader<T, E>(loader: Loader<T, E>, options: ResourceOptions<T>): Resource<T, E> {
  const state = signal<ResourceState>(options.lazy ? "idle" : "loading");
  const value = signal<T>(options.default);
  const error = signal<E | undefined>(undefined);
  const sourced = signal(false);
  const lastUpdated = signal<Date | undefined>(undefined);
  /** Bumped by reload: the watch reads it, so a reload runs the loader like a changed read. */
  const trigger = signal(0);

  /** The run that may still settle: a result of an older run is ignored. */
  let current = 0;
  let abortRun: AbortController | undefined;
  let cancelTask: (() => void) | undefined;
  let running: Watch | undefined;

  /** The outcome of run `id`, unless a newer run or a write has superseded it. */
  const settle = (id: number, outcome: Either<T, E>): void => {
    if (id !== current) {
      return;
    }
    cancelTask = undefined;
    untracked(() => {
      use(outcome, { Left: (failure) => {
        error.set(failure);
        state.set("failed");
      }, Right: (loaded) => {
        value.set(loaded);
        error.set(undefined);
        sourced.set(true);
        lastUpdated.set(new Date());
        state.set("fetched");
      } });
    });
  };

  /** Start run `id`: the loader's reads are tracked by the watch that calls this. */
  const start = (): void => {
    const id = ++current;
    abortRun?.abort();
    cancelTask?.();
    const controller = new AbortController();
    abortRun = controller;
    untracked(() => state.set("loading"));
    let pending: PromiseLike<T> | Task<T, E> | undefined;
    try {
      pending = loader(controller.signal);
    } catch (thrown) {
      settle(id, Left.of(asError(thrown) as E));
      return;
    }
    if (pending === undefined) {
      cancelTask = undefined;
      untracked(() => state.set("idle"));
      return;
    }
    if (pending instanceof Stream) {
      cancelTask = run(pending, {
        ok: (loaded) => settle(id, Right.of(loaded)),
        error: (failure) => settle(id, Left.of(failure)),
      });
      return;
    }
    pending.then(
      (loaded) => settle(id, Right.of(loaded)),
      (reason) => settle(id, Left.of(asError(reason) as E)),
    );
  };

  const ensureRunning = (): void => {
    running ??= watch(() => {
      trigger();
      start();
    }, immediately);
  };

  if (!options.lazy) {
    ensureRunning();
  }

  return {
    state: () => state(),
    value: () => value(),
    error: () => error(),
    sourced: () => sourced(),
    lastUpdated: () => lastUpdated(),
    set(next: T): void {
      current++;
      abortRun?.abort();
      cancelTask?.();
      cancelTask = undefined;
      value.set(next);
      error.set(undefined);
      sourced.set(true);
      lastUpdated.set(new Date());
      state.set("written");
    },
    reload(): void {
      if (running) {
        trigger.update((count) => count + 1);
      } else {
        ensureRunning();
      }
    },
  };
}
