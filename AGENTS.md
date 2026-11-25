# Instructions for AI agents

These guidelines apply to every AI agent working on this repository, whatever
tool runs it. They are guidance, not dogma: use common sense, and when a rule
gets in the way of clear code, say why and do what reads best.
[CLAUDE.md](CLAUDE.md) adds notes for Claude; read
[CONVENTIONS.md](CONVENTIONS.md) before writing code and
[IMPROVEMENTS.md](IMPROVEMENTS.md) before adding something it may already
list.

## Design

Prefer the established patterns when they fit the problem, and name them in
the code or in a doc comment so the next reader sees them.

- **SOLID**, as a rule of thumb: a class or function should have one clear
  job, and depend on an abstraction (an `InjectionToken`, an interface, a
  factory) where the implementation may change. Extending a feature is usually
  easier by adding code than by editing working code.
- **Gang of Four** patterns where they fit: Factory (`ViewFactory`), Strategy
  (interchangeable schedulers), Observer (`Stream`, `Emitter`), Composite
  (the view tree), Decorator (`@final`, `@Effect`), Adapter (wrapping the DOM
  in `Renderer`). Do not reach for a pattern the problem does not need.
- **Composition over inheritance.** Classes that must not be subclassed are
  marked `@final`.

## Declarative style

Where it reads well, say *what* a piece of logic yields rather than *how* to
step through it.

- Prefer transformations such as `map`, `flatMap`, `match`, `getOrElse` on
  `Maybe`, `Either`, `Task` and `Stream`, and computed signals, when they make
  the code shorter and clearer.
- Business logic should read as a description. A plain `if` or a short loop
  there is fine when it is the clearest option; avoid deep nesting and long
  branching chains, and turn them into a table, a combinator or a named
  function.
- Flow control is most at home in the basic bricks: `Maybe`, `Either`,
  `Stream`, `Task`, `Emitter`, `ChangeDetection`, the parser and the renderer.
  Keep the branching there where it is reused.

## The agreed public API

The public API is a contract the team has agreed: its classes, functions, names,
signatures and behaviour. Every change, and every pull request, must follow it.
An AI agent must not change that API on its own.

- Keep every agreed public name and signature as it is. Do not rename, remove,
  re-type or re-order parameters of an agreed export, and do not change its
  behaviour in a way the agreed API does not describe.
- Adding a new public class, function or option is a change to the API. Ask the
  user before adding one, and do not decide its shape yourself.
- If the code you are asked to write would differ from the agreed API, do not
  make the change to fit. Report the difference and wait for the user to decide
  whether the API or the code changes.
- Reading the API, checking the code against it, and listing where they differ
  are fine without asking. The tests that pin exported values (see
  [CONVENTIONS.md](CONVENTIONS.md)) are part of the agreed API.

## Working in this repository

- Run the checks before reporting a change as done: `npm test`,
  `npm run coverage` (100% lines and branches), `npm run lint`,
  `npm run typecheck`, `npm run build`. Report any failure with its output.
- Regenerate the repo map after changing exports or imports:
  `npm run repo-map -- --format markdown`.
- Do not skip tests, or add a disable comment or coverage exclusion to get
  green, without a clear reason written next to it.
- Document every new feature accurately: what it does, its syntax, and what it
  does not do. Check the docs against the code and the tests before reporting
  the change as done, and fix any doc that the change makes wrong (README,
  `docs/`, and the comment at the top of the module).
- Record each known limitation of a new feature in `IMPROVEMENTS.md`, with the
  problem and what to do about it. A limitation left out of that file is one
  nobody will remember.
- Do not open pull requests, or push to `main`, unless the user asks.
- Before pushing, rebase the branch onto the latest `main` (`git fetch origin`, then
  `git rebase origin/main`). Do not merge `main` into the branch.
- Never push to a branch whose pull request has merged. Start a new branch from the latest
  `main`, and bring over only the commits that are not yet merged.
- Keep commits and pull request bodies free of model names, and end them with
  the attribution lines the tool gives you.
