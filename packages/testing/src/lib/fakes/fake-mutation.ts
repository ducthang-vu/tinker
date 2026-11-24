// A fake mutation: the real `mutation`, driven by the test. Its mutator does not send anything: it
// returns a task whose handlers the fake keeps, one per call. `resolve` and `fail` settle the
// oldest call in flight, so the test decides what the server answered. Everything else is the real
// mutation's: `pending`, `outcome`, `result`, `error`, and how a success updates its resource. A
// component that writes through a mutation reads the fake the same way.
//
//   const save = fakeMutation<Todo, Todo>({
//     resource: todos,
//     onSuccess: (list, created) => [...list, created],
//   });
//   TestBed.providers(provide(SAVE, { useValue: save })).component(Form).build();
//   save.mutate(todo);
//   save.resolve(todo);   // the call settles: outcome "succeeded", and the resource is updated

import { mutation, type Mutation, type MutationOptions } from "@tinker/core";
import { fromComputation } from "@tinker/functional";

/** A call the fake is holding: the handlers its task settles with. */
interface InFlight<T, E> {
  readonly ok: (value: T) => void;
  readonly error: (error: E) => void;
}

/** A mutation the test drives. */
export interface FakeMutation<I, T, E = Error> extends Mutation<I, T, E> {
  /** Settle the oldest call in flight with `value`. Throws unless a call is in flight. */
  resolve(value: T): void;
  /** Settle the oldest call in flight with `error`. Throws unless a call is in flight. */
  fail(error: E): void;
  /** The inputs of every call, oldest first. */
  readonly calls: readonly I[];
}

/** A fake mutation, whose calls the test settles. */
export function fakeMutation<I, T, E = Error, U = unknown>(
  options: MutationOptions<T, U> = {},
): FakeMutation<I, T, E> {
  const inFlight: InFlight<T, E>[] = [];
  const calls: I[] = [];
  const real = mutation<I, T, E, U>((input) => {
    calls.push(input);
    return fromComputation<T, E>((ok, error) => {
      inFlight.push({ ok, error });
    });
  }, options);

  /** The oldest call in flight; a call is in flight until the test settles it. */
  const oldest = (): InFlight<T, E> => {
    const call = inFlight.shift();
    if (call === undefined) {
      throw new Error("the fake has no call in flight: call mutate() first");
    }
    return call;
  };

  return {
    pending: real.pending,
    outcome: real.outcome,
    result: real.result,
    error: real.error,
    mutate: (input) => real.mutate(input),
    reset: () => real.reset(),
    get calls() {
      return [...calls];
    },
    resolve: (value) => oldest()
      .ok(value),
    fail: (failure) => oldest()
      .error(failure),
  };
}
