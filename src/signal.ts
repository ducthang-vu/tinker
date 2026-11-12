// Fine-grained reactivity: signals, effects and computed values.
//
// The idea: when an effect runs, every signal it reads records that effect
// as a subscriber. When a signal is written, it re-runs its subscribers.

/** A function that reads the current value and tracks the read. */
export type Accessor<T> = () => T;

/** A readable and writable reactive value. */
export interface Signal<T> extends Accessor<T> {
  /** Set a new value, or compute one from the previous value. */
  set(next: T | ((prev: T) => T)): void;
  /** Read the value without subscribing the current effect. */
  peek(): T;
}

interface Runner {
  run(): void;
  deps: Set<Set<Runner>>;
}

let currentEffect: Runner | null = null;

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subscribers = new Set<Runner>();

  const read = (() => {
    if (currentEffect) {
      subscribers.add(currentEffect);
      currentEffect.deps.add(subscribers);
    }
    return value;
  }) as Signal<T>;

  read.set = (next) => {
    const resolved =
      typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    if (Object.is(resolved, value)) return;
    value = resolved;
    // Copy first: running an effect can change the subscriber set.
    for (const sub of [...subscribers]) sub.run();
  };

  read.peek = () => value;

  return read;
}

/** Run `fn` now and again whenever a signal it read changes. Returns a stop function. */
export function effect(fn: () => void): () => void {
  const runner: Runner = {
    deps: new Set(),
    run() {
      // Drop old subscriptions so we only track what this run reads.
      cleanup(runner);

      const prev = currentEffect;
      currentEffect = runner;
      try {
        fn();
      } finally {
        currentEffect = prev;
      }
    },
  };
  runner.run();
  return () => cleanup(runner);
}

function cleanup(runner: Runner): void {
  for (const dep of runner.deps) dep.delete(runner);
  runner.deps.clear();
}

/** A read-only value derived from other signals. */
export function computed<T>(fn: () => T): Accessor<T> {
  // Each effect runs immediately, so the signal is set before anyone reads it.
  const s = signal<T>(undefined as T);
  effect(() => s.set(fn()));
  return () => s();
}
