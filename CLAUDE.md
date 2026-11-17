# Tinker: notes for Claude

Tinker is a learning frontend framework in TypeScript, modelled on Angular:
signals, dependency injection, components and directives, change detection.

## Before exploring the code

Run `npm run repo-map -- --format markdown` and read `.repo-map.md`: one
line per file (its imports), and one line per exported name (its signature).
It is about a quarter of the size of the generated declarations, so it is the
cheapest way to find where something lives. It is committed, and `npm test`
fails when it is out of date: regenerate it after changing exports or imports.

## Layout

- `packages/core` (`@tinker/core`): signals, di, view and utils, each module with a public
  `index.ts`. `packages/core/src/index.ts` re-exports them as `tinker`.
- `packages/functional` (`@tinker/functional`): the functional helpers (Maybe, Either, Task,
  Stream, Emitter). Its public API is `src/public-api.ts`, and `src/index.ts` re-exports it.
- `examples/basics`: the demo the root page opens. It imports from `@tinker/core`.
- `scripts/`: the repo-map generator and its tests.

## Commands

- `npm test`, `npm run coverage`: tests; coverage must stay at 100% lines and branches.
- `npm run typecheck`, `npm run build`: these run TypeScript 7 (`typescript7`).
  Do not use a bare `npx tsc`: it runs TypeScript 6 (the `typescript` package,
  used only by ESLint's parser).
- `npm run lint` and `npm run format`: ESLint is the only formatter. Every
  chain of calls is split with one call per line.

## Conventions

Read `CONVENTIONS.md` before writing code (DI and factories, no `any`,
`Maybe`/`Either`, tests next to their files). `IMPROVEMENTS.md` lists known
gaps and planned work; check it before adding something it already covers.

## Agent instructions

The rules for every AI agent (design patterns, SOLID, declarative code,
where flow control is allowed) are in [AGENTS.md](AGENTS.md). Follow them.
