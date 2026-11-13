// Keeps user code out of the marking phase.
//
// When a signal changes, its consumers are marked dirty, recursively.
// During that walk only our own code may run: flipping flags. Anything that
// could run user code (a watch's scheduler) is queued with `afterMarking`
// and runs once the outermost marking walk has finished. By then the whole
// graph is marked, so user code never sees it half-updated, and an error in
// user code cannot stop the walk halfway.

import { runBatches } from "../../../utils/run-all.ts";

let depth = 0;
let flushing = false;
const queue: (() => void)[] = [];

/** Run a marking walk. Queued work runs when the outermost walk finishes. */
export function marking(walk: () => void): void {
  depth++;
  try {
    walk();
  } finally {
    depth--;
    if (depth === 0) {
      flush();
    }
  }
}

/** Run `fn` after the current marking walk, or right away if none is running. */
export function afterMarking(fn: () => void): void {
  if (depth > 0 || flushing) {
    queue.push(fn);
  } else {
    fn();
  }
}

/**
 * Run all queued work. Every item runs even if an earlier one throws;
 * the first error is re-thrown at the end.
 */
function flush(): void {
  if (flushing) {
    return; // an outer flush is already draining the queue
  }
  flushing = true;
  try {
    // Work queued while flushing joins the queue, and runs in a later batch.
    runBatches(() => queue.splice(0));
  } finally {
    flushing = false;
  }
}
