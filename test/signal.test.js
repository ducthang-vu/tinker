import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, effect, computed } from "../src/signal.js";

test("signal reads and writes", () => {
  const count = signal(1);
  assert.equal(count(), 1);
  count.set(2);
  assert.equal(count(), 2);
  count.set((n) => n + 1);
  assert.equal(count(), 3);
});

test("effect re-runs when a signal it read changes", () => {
  const count = signal(0);
  const seen = [];
  effect(() => seen.push(count()));
  count.set(1);
  count.set(2);
  assert.deepEqual(seen, [0, 1, 2]);
});

test("effect does not re-run when the value is unchanged", () => {
  const count = signal(0);
  let runs = 0;
  effect(() => (count(), runs++));
  count.set(0);
  assert.equal(runs, 1);
});

test("stopping an effect unsubscribes it", () => {
  const count = signal(0);
  let runs = 0;
  const stop = effect(() => (count(), runs++));
  stop();
  count.set(1);
  assert.equal(runs, 1);
});

test("effects only track signals read in the latest run", () => {
  const useA = signal(true);
  const a = signal("a");
  const b = signal("b");
  let runs = 0;
  effect(() => (runs++, useA() ? a() : b()));
  useA.set(false);
  a.set("a2"); // no longer read, so it should not re-run
  assert.equal(runs, 2);
});

test("computed derives from other signals", () => {
  const n = signal(2);
  const doubled = computed(() => n() * 2);
  assert.equal(doubled(), 4);
  n.set(5);
  assert.equal(doubled(), 10);
});
