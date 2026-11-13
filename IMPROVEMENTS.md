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

### 1. Stop the engine's own effects and hooks

Each component has its own injector, which provides its own `Effects` and
`RenderHooks`: everything a component registers through them (decorated
methods included) stops when the component is destroyed. Done.

**Problem.** Services provided by the engine (`providedIn: "root"`, or
`Engine.create({ providers })`) use the engine's `Effects` and
`RenderHooks`, which stop only when the engine's injector is destroyed, and
the engine has no `destroy()` yet. A service in a component's `providers`
is fine: it uses the component's.

**To do.** Add `engine.destroy()`: destroy the views, then the engine's
injector (which stops its effects and cancels its hooks).
