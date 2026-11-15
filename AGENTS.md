# Instructions for AI agents

These rules apply to every AI agent working on this repository, whatever
tool runs it. [CLAUDE.md](CLAUDE.md) adds notes for Claude; read
[CONVENTIONS.md](CONVENTIONS.md) before writing code and
[IMPROVEMENTS.md](IMPROVEMENTS.md) before adding something it may already
list.

## Design

Code follows established design patterns, and says so in its structure.

- **SOLID.** One reason to change per class or function. Depend on
  abstractions (an `InjectionToken`, an interface, a factory) where the
  implementation may vary, and inject them with `inject()`. Extend by adding
  code, not by editing working code: a new binding kind is a new class, not a
  new branch in an old one.
- **Gang of Four.** Use the named pattern when it fits the problem, and name
  it in the code or in its doc comment: Factory (`ViewFactory`), Strategy
  (interchangeable schedulers), Observer (`Stream`, `Emitter`), Composite
  (the view tree), Decorator (`@final`, `@Effect`), Adapter (wrapping the
  DOM in `Renderer`). Do not add a pattern the problem does not need.
- **Composition over inheritance.** Classes that must not be subclassed are
  marked `@final`.

## Declarative first

Say *what* a piece of logic yields, not *how* to step through it.

- Prefer expressions and transformations: `map`, `flatMap`, `filter`,
  `match`, `getOrElse` on `Maybe`, `Either`, `Task` and `Stream`, and
  computed signals over reassigned variables and loops.
- Business logic (the view's behaviour, the signals' rules, what a directive
  or component does) contains **no** `if`, `else`, `for`, `while`, `switch`,
  `try` or `?:` branching in the function body where a combinator, a
  table or a separate function will do.
- Flow control belongs to the **basic bricks**: the small, well-tested
  primitives that everything else composes. Those are `Maybe`, `Either`,
  `Stream`, `Task`, `Emitter`, `ChangeDetection`, the parser and the
  renderer. Branching lives there, once, and is reused everywhere else.
- A loop that is clearer than its functional rewrite is allowed, but it must
  sit inside a brick, not in business logic. Say why in a comment if the
  rewrite is not obvious.

## Working in this repository

- Run the checks before reporting a change as done: `npm test`,
  `npm run coverage` (100% lines and branches), `npm run lint`,
  `npm run typecheck`, `npm run build`. Report failures with their output.
- Regenerate the repo map after changing exports or imports:
  `npm run repo-map -- --format markdown`.
- Never leave a test skipped, a disable comment without a reason, or a
  coverage exclusion to get green.
- Do not open pull requests, or push to `main`, unless the user asks.
- Keep commits and pull request bodies free of model names, and end them with
  the attribution lines the tool gives you.
