# Improvements to do

Known limitations, written down so they are not forgotten. Each entry says
what the problem is, why it matters, and what to do.

## View scheduler (`src/view/runtime/view-scheduler.ts`)

View updates are batched in a microtask: every signal write made in the same
task (an event handler, a fetch callback) leads to one flush, before the
browser paints. That is the right default (Vue and Lit do the same), but it
has these gaps.

### 1. Guard against infinite update loops — priority

**Problem.** Tasks scheduled during a flush run in the same flush
(`runBatches` keeps draining the queue). A view update that writes a signal
re-scheduling itself (directly or through another view) loops forever. The
page freezes: microtasks never yield to rendering or input.

**To do.** Cap the number of batches in one flush (Angular and Vue use about
100), and throw a clear error naming the problem, e.g.
`"View updates did not settle after 100 rounds: a view update probably writes a signal it depends on"`.

### 2. Several flushes with `async` code

**Problem.** Each `await` lets microtasks run, so
`a.set(1); await x; b.set(2);` flushes twice in one frame. The result is
correct, the work is not minimal.

**To do.** Nothing for now. If it shows up in profiles, try another strategy,
e.g. Angular's zoneless race between `setTimeout` and
`requestAnimationFrame`. `ViewScheduler` is provided per engine, so it can be
replaced without touching the views.

### 3. An empty extra flush

**Problem.** `flush()` resets `flushRequested` at its start, so a task
scheduled *during* a flush requests another microtask, although the current
flush already runs it. The extra flush finds an empty queue: harmless, but
wasted.

**To do.** Reset `flushRequested` at the end of `flush()` (in a `finally`,
so an error does not block later flushes).

### 4. Parents before children

**Problem.** Queued views run in the order they were scheduled. Once
components nest, a child could update before its parent, then again after
the parent changes its inputs: wasted work, and possibly a frame showing an
inconsistent state.

**To do.** When child components exist, run the queue in tree order (parents
first), e.g. by sorting each batch by view depth.
