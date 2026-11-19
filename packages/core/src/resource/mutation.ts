// A mutation: a write, started by a call. Unlike a resource it has no inputs to watch, so it
// never cancels: a request that was sent may already have changed the server. Calls run in
// parallel, and the caller prevents overlap by checking `pending()` before calling.
//
//   const save = mutation((todo: Todo) => http.post("/todos", todo), { resource: todos,
//     onSuccess: (list, created) => [...list, created] });
//   save.mutate(todo);
//   save.outcome();   // "none" | "succeeded" | "failed": the last call to finish

import { Task } from "@tinker/functional";
import { signal, type ReadonlySignal } from "../signals/index.ts";
import type { Resource } from "./resource.ts";

/** What a mutation's last finished call did. */
export type MutationOutcome = "none" | "succeeded" | "failed";

export interface MutationOptions<T, U> {
  /** The resource the write affects. */
  readonly resource?: Resource<U, unknown>;
  /** Update the resource from the response. Without it, the resource is reloaded. */
  readonly onSuccess?: (current: U, result: T) => U;
}

export interface Mutation<I, T, E = Error> {
  /** How many calls are in flight. */
  readonly pending: ReadonlySignal<number>;
  /** What the last call to finish did. */
  readonly outcome: ReadonlySignal<MutationOutcome>;
  /** The result of the last success. */
  readonly result: ReadonlySignal<T | undefined>;
  /** The error of the last failure. */
  readonly error: ReadonlySignal<E | undefined>;
  /** Start a call. Always allowed: calls run in parallel. */
  mutate(input: I): void;
  /** Back to "none", with no result and no error. In-flight calls are not affected. */
  reset(): void;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function mutation<I, T, E = Error, U = unknown>(
  mutator: (input: I) => PromiseLike<T> | Task<T, E>,
  options: MutationOptions<T, U> = {},
): Mutation<I, T, E> {
  const pending = signal(0);
  const outcome = signal<MutationOutcome>("none");
  const result = signal<T | undefined>(undefined);
  const error = signal<E | undefined>(undefined);

  const succeed = (value: T): void => {
    pending.update((count) => count - 1);
    result.set(value);
    error.set(undefined);
    outcome.set("succeeded");
    const { resource, onSuccess } = options;
    if (resource) {
      if (onSuccess) {
        resource.set(onSuccess(resource.value(), value));
      } else {
        resource.reload();
      }
    }
  };

  const fail = (failure: E): void => {
    pending.update((count) => count - 1);
    error.set(failure);
    outcome.set("failed");
  };

  return {
    pending: () => pending(),
    outcome: () => outcome(),
    result: () => result(),
    error: () => error(),
    mutate(input: I): void {
      pending.update((count) => count + 1);
      let started: PromiseLike<T> | Task<T, E>;
      try {
        started = mutator(input);
      } catch (thrown) {
        fail(asError(thrown) as E);
        return;
      }
      if (started instanceof Task) {
        started.run({ ok: succeed, error: fail });
        return;
      }
      started.then(succeed, (reason) => fail(asError(reason) as E));
    },
    reset(): void {
      outcome.set("none");
      result.set(undefined);
      error.set(undefined);
    },
  };
}
