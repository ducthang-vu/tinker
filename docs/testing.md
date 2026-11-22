# Testing with `@tinker/testing`

This page is how to test a Tinker app: the test bed, the fixture and its elements, and
mocks. The API is in [`packages/testing/src/api.ts`](../packages/testing/src/api.ts).

## The test bed

`TestBed.component(Type).build()` renders the component as the root of a fixture and
returns it. Configure the bed in any order before `build()`:

```ts
const fixture = TestBed.providers(provide(API_URL, { useValue: "x" }))
  .inputs({ label: "Ada" })
  .component(Greeting)
  .build();
```

- `providers(...)` replaces the bed's services, as `bootstrap`'s providers do.
- `inputs({ name: value })` sets the root's inputs before its first render, so required
  inputs are bound in time.
- `host(element)` renders into a given element instead of a new one.
- `override(from, to)` replaces a class wherever the bed's templates use it (see mocks).

The fixture:

- `root` is the component under test, as a testing element (below).
- `detectChanges()` runs a change detection tick now.
- `whenStable()` resolves once the writes made so far have rendered. It waits for the
  microtasks they request, then flushes. A timer's write is not waited for: advance timers
  in the test.
- `get(token)` reads a service of the bed.
- `destroy()` destroys the component and the bed's engine. Calling it again does nothing.

## Testing elements

Every part of the page a test looks at is a testing element.

- `element` is the DOM element, and `text()` is its text, with whitespace collapsed and
  trimmed. It is not `element.textContent`, which keeps the template's line breaks and
  indentation.
- `getAttribute(name)` reads an attribute, or `null` when it is not set.
- `dispatchEvent(type, init?)` dispatches an event and then runs change detection, so the
  DOM shows what the listeners changed. `dispatchEvent("click")` is a click.
- `query(selector | Class)` is the first match, in document order, among all descendants. It
  throws, naming what was looked for, when nothing matches.
- `queryAll(selector | Class)` is every match, or an empty array. Use it to check that
  something is absent.

A class match is a testing element for a component or directive, with its `instance`,
`inputs`, `outputs`, `setInput(name, value)` and `emitOutput(name, value)`. Reading an input
that nothing has bound throws `InputNotBoundError`. Setting or emitting a name the component
does not have throws, naming the component.

## Cleanup

Each fixture is kept until it is destroyed. `cleanup()` destroys the ones left over. When
the test runner offers `afterEach` as a global (Vitest with `globals: true`), the package
runs `cleanup` after each test. Otherwise the test setup calls `afterEach(cleanup)`.

A test that must control when its fixture is destroyed uses `TestBed.manualCleanup()`. Such
a fixture is not destroyed by `cleanup()`.

A fixture without `manualCleanup()` must be built inside a test. Built outside one (in
`beforeAll`, say), it throws. With the runner's `onTestFinished`, each fixture is destroyed
when the test that built it ends, so concurrent tests do not destroy each other's fixtures.
The runner is given with `registerRunner({ afterEach, inTest, onTestFinished })` in the test
setup. This repo's Vitest setup is `vitest.setup.ts`; without a runner, fixtures are destroyed
by `cleanup()` and nothing is checked.

## Templates for tests

`ComponentBuilder.template(source).directives(...types).build()` makes a component class
from a template. Its main use is a host for a directive under test:

```ts
const Host = ComponentBuilder.template("<p highlight>x</p>")
  .directives(Highlight)
  .build();
```

## Mocks

A mock replaces a real component or directive for one test. It keeps the real class's
selector and `exportAs`, so a template still matches it, and it renders nothing. The mock
builders are classes, each started with the real class:

- `new MockComponentBuilder(Child)` or `MockComponentBuilder.of(Child)`, for a component.
- `new MockDirectiveBuilder(Child)` or `MockDirectiveBuilder.of(Child)`, for a directive.

A component builder refuses a directive, and a directive builder refuses a component, so the
kind of mock matches the kind of class.

The builders are immutable: each method returns a new builder.

- `requiredInputs(...names)` adds inputs that are unbound until set. A required input read
  before it is set throws `InputNotBoundError`.
- `optionalInputs({ name: default })` adds inputs with the default the author gives. The
  default is typed from the real input.
- `outputs(...names)` adds outputs, so a parent template can listen to them.
- `fields({ name: value })` sets fields of the mock.
- `methods({ name: implementation })` attaches each implementation as the mock's method. A
  `vi.fn()` is the method itself, so a test can check its calls on the instance.

Names are checked against the public members of the real class. A private member cannot be
named, which is intended: a template that relies on a private member cannot be replaced
faithfully. A mock also does not copy the real class's providers, imports or host bindings,
so a mocked directive's host listeners do not run.

Replace a class in a bed with `override`:

```ts
const show = vi.fn();
const mock = MockComponentBuilder.of(Gauge).methods({ show }).build();
const fixture = TestBed.override(Gauge, mock).component(Panel).build();
```

`override` accepts only a mock of the class it replaces, so a mismatch is a type error. A
query for `Gauge`, from the test or from a parent template, finds the mock.

## Limits

- A mock's inputs and outputs must be listed. A missing name is not caught when the mock is
  built, and a parent template binding it reads nothing.
- Writes from timers are not waited for by `whenStable`.
- A concurrent test's fixture is destroyed when that test ends, with the runner's
  `onTestFinished`. Without a runner, a concurrent test needs `manualCleanup()`.
