// The public entry point for signals. Everything users may import is listed
// here explicitly; nothing from ./internal is reachable except through it.

// Types
export type { ReadonlySignal, Signal, Watch } from "./signals.ts";
export type { EqualityFn } from "./internal/types.ts";
export type { OnCleanup, Runnable, WatchFn, WatchScheduler } from "./internal/watch.ts";

// Functions
export { computed, signal, watch } from "./signals.ts";
export { untracked } from "./internal/context/active-consumer.ts";

// Errors
export { SignalCycleError, SignalWriteError, WatchLoopError } from "./internal/errors.ts";
