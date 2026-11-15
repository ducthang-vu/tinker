// Unhandled errors: exceptions thrown by listeners that nobody can catch.
//
// A hot emitter calls its listeners on behalf of its owner, who must not see
// (or be broken by) a bug in a listener: every listener runs, and the
// exception is reported here instead of thrown into `emit()`. By default it
// is re-thrown in a microtask, so it surfaces like any uncaught error (the
// browser's `window.onerror`, Node's `uncaughtException`) without disturbing
// the code that was running. RxJS does the same with its unhandled errors.
//
// Tests swap the reporter with `withUnhandledReporter`.

/** What happens to an exception that has nowhere to go. */
export type UnhandledReporter = (error: unknown) => void;

const rethrowLater: UnhandledReporter = (error) => {
  queueMicrotask(() => {
    throw error;
  });
};

let reporter: UnhandledReporter = rethrowLater;

/** Report `error`: it was thrown by a listener, and nobody can handle it. */
export function reportUnhandled(error: unknown): void {
  reporter(error);
}

/** Run `fn` with `replacement` as the reporter; the previous one is restored afterwards. */
export function withUnhandledReporter<R>(replacement: UnhandledReporter, fn: () => R): R {
  const previous = reporter;
  reporter = replacement;
  try {
    return fn();
  } finally {
    reporter = previous;
  }
}
