# Conventions

How code is written in Tinker. Known gaps and planned work are in
[IMPROVEMENTS.md](IMPROVEMENTS.md).

## Services get collaborators through DI, not `new`

A service (an `@Injectable` class) does not `new` another class that does
work: it injects it, or a factory for it.

```ts
// No
const view = new View(host, component, nodes, this.renderer);

// Yes
private readonly views = inject(ViewFactory);
const view = this.views.create(host, component, nodes);
```

A factory is an `@Injectable` next to the class it creates (e.g.
`ViewFactory` in `view.ts`). It injects the app's services the object needs,
and `create(...)` takes what differs per object. Every factory is listed in
the engine's default providers, so a test (or an app) can replace it:

```ts
Engine.create({ providers: [provide(ViewFactory, { useClass: RecordingViewFactory })] });
```

Exempt: values (`Maybe`, `Either`, `Task`, `ForwardRef`), data holders
(`ElementContext`), pure parsing (`HostBindings`, `ExpressionParser`),
helpers holding state for a single call (`RunFirstNow`), and the internals
of `signals`, `di` and `functional`. Tests may always use `new`.

## Modules and files

- Each module (`signals`, `di`, `view`, `functional`) has an `index.ts`
  listing its public API explicitly, with a test pinning the exported values.
- Files under a module's `internal/` do not import from outside that module
  (shared `src/utils` and `src/functional` are fine).
- `view` uses only the public APIs of `di` and `signals`.
- Tests live next to the file they test: `view.ts` → `view.test.ts`.

## Code style

- Standard TC39 decorators (not TypeScript's experimental ones).
- Classes with static factories; private constructors where possible.
- Composition over inheritance.
- Dependencies with `inject()` only: no constructor injection, and no
  Service Locator in the public API.
- Lookups that may find nothing return `Maybe`, not `T | undefined`.
  Operations that may fail return `Either` / `EitherError` where the caller
  should handle the error; `getOrThrow` goes back to exceptions.

## Tests

- 100% line and branch coverage (`npm run coverage` fails below it).
- Typecheck (`npm run typecheck`) and build (`npm run build`) pass.
