# Change detection: Tinker's design

This page is the design of how Tinker decides what to update. It is a Tinker
design, not Angular's. Where we differ from Angular, it's on purpose, and the
differences are listed below. Angular's model is the reference point, not the
standard. The design is kept consistent, so that it's easier to change later in
one place when we know more about its costs.

## The rules

1. **Signals are the only trigger.** A view is updated because a signal it read
   changed. Nothing else causes an update: no zone, no re-run after an event
   listener, no manual check.
2. **Each view has its own watch.** A view is a component's template, or an
   embedded view such as a branch of `@if` or a row of `@map`. Its watch runs
   that view's bindings, and tracks the signals they read, so it is the only
   thing that decides when the view is dirty.
3. **Only the watch of the view that reads a signal is scheduled.** A signal's
   change schedules the watches that read it, and nothing else.
4. **`@let` values are computed signals.** A `@let` is a computed signal in the
   template's scope. A view that reads it through an expression depends on the
   signals behind it, so it is scheduled when those change, without the parent
   passing anything down.
5. **Structure goes through the container.** Adding, moving and removing views
   (`@if` branches, `@map` rows, components created at runtime) is done by the
   container of the anchor that owns them. A view is removed when its owner is
   destroyed.
6. **Values are written only when they change.** A binding writes the DOM only
   when its value differs from the last one it wrote.

## Where a view lives

Every view sits in one of two places, and Tinker never adds an element of its
own to hold one:

1. **On an element the author wrote.** A component's view is on its host
   element, which is the element the author put in the page or in a template.
2. **After a comment.** An embedded view, or a view a container adds at runtime,
   sits after an anchor comment that the container owns. Its nodes are the
   top-level nodes it renders, in order, and they are moved and removed together.

So the framework never wraps a view in a `<div>` or any other element. A wrapper
would change CSS selectors (such as `ul > li`), make some HTML invalid (a `<div>`
directly in a `<ul>`), and affect layout, none of which the author asked for.

## Where we differ from Angular

| | Angular | Tinker |
|---|---|---|
| Watch per view | One reactive consumer per view, embedded views included | The same: one watch per view |
| Who schedules an embedded view | The parent's refresh visits its containers and refreshes their views | The embedded view's own watch is scheduled by its own signals |
| `@let` | A value set during the parent's refresh | A computed signal in the scope |
| Refresh order | The parent refreshes before its children | Not yet enforced: see "Known gaps" |
| Dirty marking | Ancestors are marked for traversal | Not needed: each watch is scheduled by its own signals |
| Dependencies of a child | A child reads values from the parent, and the parent's refresh updates them | A child reads a `@let` and depends on the signals behind it |

The consequence of the last two rows: a child can be scheduled without the
parent running. Angular needs the parent to refresh the subtree, and Tinker
doesn't.

## Why this design

- **Signals are already the only trigger in Tinker.** A parent-driven refresh
  would add a second way to schedule views, and a second source of truth for
  when a view is dirty.
- **The dependency is what the reader reads.** A child that reads `count` depends
  on whatever `count` depends on. Nothing has to be passed down, so the child's
  correctness doesn't depend on the parent's refresh.
- **One rule for every view.** Components, `@if` branches and `@map` rows all
  run the same way, so there's one path to test and one to change.

## What it costs

- **Each child's watch tracks the signals behind every `@let` it reads.** A
  change to a shared source can schedule several watches. That's the price of
  not passing changes down, and it grows with the number of `@let`s read.
- **A `@let` is evaluated once per change, and shared.** Its computed value is
  cached, so several readers in one run don't recompute it.
- **Watches are per view.** A large list means many watches, one for each item.
  `@map` with `track` keeps a row's view, and so its watch, while its identity is
  in the list.

## Known gaps

- **Refresh order is not enforced.** The view scheduler doesn't yet run parents
  before children (see `IMPROVEMENTS.md`). With reactive `@let`, a child doesn't
  depend on its parent's order for scope values, but the parent's own bindings
  and structural changes still depend on it.
- **A scheduled view may run more than once in a tick.** Nothing merges the runs
  of one view when several of its signals change together.
- **Costs are not measured yet.** This design is judged by consistency and
  simplicity first. Benchmarks come before any change for speed.

## What may change later

Any of these could change without changing the rules above, because they live
in the scheduler and the watch:

- running views in parent-first order, or in depth order;
- merging runs of a view within one tick;
- batching the DOM writes of a view;
- skipping the watch of a view that no signal in its subtree changed.

A change that breaks rule 1, 2 or 5 is a change of design, and should be
written here first.
