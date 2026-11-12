// Fine-grained reactivity: signals, effects and computed values.
//
// The idea: when an effect runs, every signal it reads records that effect
// as a subscriber. When a signal is written, it re-runs its subscribers.

let currentEffect = null;

export function signal(initial) {
  let value = initial;
  const subscribers = new Set();

  function read() {
    if (currentEffect) {
      subscribers.add(currentEffect);
      currentEffect.deps.add(subscribers);
    }
    return value;
  }

  read.set = (next) => {
    if (typeof next === "function") next = next(value);
    if (Object.is(next, value)) return;
    value = next;
    // Copy first: running an effect can change the subscriber set.
    for (const sub of [...subscribers]) sub.run();
  };

  read.peek = () => value; // read without subscribing

  return read;
}

export function effect(fn) {
  const runner = {
    deps: new Set(),
    run() {
      // Drop old subscriptions so we only track what this run reads.
      for (const dep of runner.deps) dep.delete(runner);
      runner.deps.clear();

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

  // Return a function that stops the effect.
  return () => {
    for (const dep of runner.deps) dep.delete(runner);
    runner.deps.clear();
  };
}

export function computed(fn) {
  const s = signal();
  effect(() => s.set(fn()));
  return () => s();
}
