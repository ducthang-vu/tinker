# Improvements to do

Known limitations, written down so they are not forgotten. Each entry says
what the problem is, why it matters, and what to do.

## Change detection (`src/view/runtime/change-detection.ts`, its schedulers)

A change detection cycle runs in a microtask: every signal write made in the
same task (an event handler, a fetch callback) leads to one cycle, before the
browser paints. That is the right default (Vue and Lit do the same), but it
has these gaps.

### 1. Several cycles with `async` code

**Problem.** Each `await` lets microtasks run, so
`a.set(1); await x; b.set(2);` runs two cycles in one frame. The result is
correct, the work is not minimal.

**To do.** Nothing for now. If it shows up in profiles, try another strategy,
e.g. Angular's zoneless race between `setTimeout` and
`requestAnimationFrame`. Only `ChangeDetection.request` decides when a cycle
runs, so this is a change in one place.

### 2. Parents before children

**Problem.** Queued views run in the order they were scheduled. Once
components nest, a child could update before its parent, then again after
the parent changes its inputs: wasted work, and possibly a frame showing an
inconsistent state.

**To do.** When child components exist, run the queue in tree order (parents
first), e.g. by sorting each batch by view depth.

## Effects (`src/view/authoring/effect.ts`)

### 1. Destroy effects automatically with their owner — priority

**Problem.** `effect()` returns a handle, and the effect runs until
`destroy()` is called on it. An effect created by a component keeps running
after the component's view is destroyed, and keeps the component in memory,
unless the author destroys it. Same for a service whose injector is
destroyed.

**To do.** Destroy each effect with its owner, as Angular does:
- in a component or directive: when its view is destroyed (through the
  lifecycle's `onDestroy`, in `stash@{0}`, once it is adapted to ticks);
- in a service: when its injector is destroyed. The public DI API has no
  way to register a destroy callback yet: add one (a `DestroyRef`-like
  service, injectable wherever `inject()` works).
