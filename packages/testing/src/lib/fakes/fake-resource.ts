// A fake resource: the real `resource`, driven by the test. Its loader does not load anything: it
// returns a task whose handlers the fake keeps, so the test settles the load it is running, with
// `resolve` or `fail`. It reads `inputs`, as a real loader reads signals: changing them starts a
// new load. Everything else is the real resource's: its states, its signals, how a write aborts a
// load, how a failure keeps the last value. A component that reads a resource through injection
// reads the fake the same way.
//
//   const user = fakeResource<User>({ default: emptyUser, autoLoad: true });
//   TestBed.providers(provide(USER, { useValue: user })).component(Profile).build();
//   user.resolve({ name: "Ada" });   // the component now shows Ada
//
// To spy on a method, use the test framework's spy (`vi.spyOn(user, "reload")`) and let the real
// call through: the fake then behaves as it does without the spy.

import { resource, type Loader, type Resource } from "@tinker/core";
import { fromComputation } from "@tinker/functional";

/**
 * The options of a fake resource. `autoLoad` says whether it starts loading, as a real resource
 * does when its loader runs at creation. With `autoLoad`, `autoResolve` is the value of that first
 * load, so the fake starts fetched with it (an initial response).
 */
export type FakeResourceOptions<T> = {
  /** The value before the first success. */
  readonly default: T;
  /** What the loader reads, as a real loader reads signals: a change to it starts a new load. */
  readonly inputs?: () => unknown;
} & (
  | { readonly autoLoad: true; readonly autoResolve?: T }
  | { readonly autoLoad: false }
);

/** A resource the test drives. */
export interface FakeResource<T, E = Error> extends Resource<T, E> {
  /** Settle the load in progress with `value`: state "fetched". Throws unless loading. */
  resolve(value: T): void;
  /** Settle the load in progress with `error`: state "failed". Throws unless loading. */
  fail(error: E): void;
  /** A new load, as a change to the inputs starts one: the value is kept, not counted. */
  trigger(): void;
  /** `trigger()`, then `resolve(value)`: a new load that ends with `value`. */
  triggerAndResolve(value: T): void;
  /** How many times `reload()` was called. */
  readonly reloads: number;
}

/** The handlers of the load in progress: the task's ok and error. */
interface Handlers<T, E> {
  readonly ok: (value: T) => void;
  readonly error: (error: E) => void;
}

/** A fake resource that starts loading when `autoLoad`, and is idle otherwise. */
export function fakeResource<T, E = Error>(options: FakeResourceOptions<T>): FakeResource<T, E> {
  /** The handlers of the load the real resource is running, if one is. */
  let running: Handlers<T, E> | undefined;
  const read = options.inputs;
  const loader: Loader<T, E> = () => {
    read?.();
    return fromComputation<T, E>((ok, error) => {
      running = { ok, error };
    });
  };
  const real = resource<T, E>(loader, {
    default: options.default,
    lazy: !options.autoLoad,
  });
  let reloads = 0;

  /** The handlers of the load in progress: a load is in progress while the state is "loading". */
  const inProgress = (): Handlers<T, E> => {
    if (running === undefined || real.state() !== "loading") {
      throw new Error(`the fake has no load in progress, its state is "${real.state()}": call trigger() or reload() first`);
    }
    return running;
  };

  if (options.autoLoad && options.autoResolve !== undefined) {
    inProgress()
      .ok(options.autoResolve);
  }

  return {
    state: real.state,
    value: real.value,
    error: real.error,
    sourced: real.sourced,
    lastUpdated: real.lastUpdated,
    get reloads() {
      return reloads;
    },
    set: (value) => real.set(value),
    reload: () => {
      reloads += 1;
      real.reload();
    },
    trigger: () => real.reload(),
    triggerAndResolve: (value) => {
      real.reload();
      inProgress()
        .ok(value);
    },
    resolve: (value) => inProgress()
      .ok(value),
    fail: (failure) => inProgress()
      .error(failure),
  };
}
