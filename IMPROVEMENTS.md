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

## Components

### 1. A component's own `onDestroy()` is never called

**Problem.** Services and directives are created by an injector, which calls
their `onDestroy()` when it is destroyed. A component is created with
`new type()` inside its injector's context, not by the injector, so an
`onDestroy()` method on a component never runs. It can clean up through its
`Effects` and `RenderHooks`, but not with a plain method, as with Angular's
`ngOnDestroy`.

**To do.** Provide the component in its own injector and create it with
`inject(type)`, like host directives: its injector then calls its
`onDestroy()` when the view is destroyed.

### 2. Dynamic components do not know where they are

**Problem.** A `ViewContainerRef` comes from `engine.createViewContainer(anchor)`,
and the components it creates get an injector whose parent is the engine's,
wherever the anchor is. A container inside a component's template, e.g. a
directive in `<tk-list>` adding `<tk-item>`s at runtime, then creates items
that:

- cannot inject what is around them: not the list's providers (`ListStore`),
  not `List` itself, not the directive next to them; worse, if the engine
  also provides that token, they silently get the engine's instance;
- outlive the list: they are not part of the list's view, so destroying the
  list leaves them alive (effects still running) unless `container.clear()`
  is called by hand.

**To do.** As in Angular, let a directive inject its container:
`inject(ViewContainerRef)` gives a container at the directive's element,
which carries its place:

- its parent injector is that element's injector, so created components
  inject what surrounds them;
- its owner view is the view of the template it is in, so created
  components are destroyed with it.

`engine.createViewContainer(anchor)` stays for containers outside any
component (e.g. at the top of a page), with the engine's injector.
