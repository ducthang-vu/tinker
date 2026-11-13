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

## Effects and render hooks (`src/view/authoring/effects.ts`, `render-hooks.ts`)

### 1. Destroy effects and cancel render hooks with their owner — priority

**Problem.** `Effects.create` returns a handle, and the effect runs until
`destroy()` is called on it. `RenderHooks.afterEachRender` returns a Cancel,
and the hook runs until it is called. An effect or hook registered by a
component keeps running after the component's view is destroyed, and keeps
the component in memory, unless the author stops it. Same for a service
whose injector is destroyed. With the decorators (`@Effect()`,
`@AfterEachRender()`, `@AfterNextRender()`) the author cannot even stop
them: there is no handle.

**To do.** Stop them with their owner, as Angular does. Both are services,
so this can be done in one place: give them a lifetime per owner.
- In a component or directive: when its view is destroyed. Needs an
  injector (or at least a destroy scope) per component, so `inject(Effects)`
  and `inject(RenderHooks)` know their owner.
- In a service: when its injector is destroyed. The public DI API has no
  way to register a destroy callback yet: add one (a `DestroyRef`-like
  service, injectable wherever `inject()` works).
