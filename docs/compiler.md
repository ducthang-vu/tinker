# The template compiler

Templates are strings, parsed at runtime. The compiler, `@tinker/compiler`, checks
them at build time, so a template error stops the build instead of the first render.
It can also replace each template with its compiled tree, so the app skips parsing
at startup. Both are opt-in per build; the default only checks.

## The Vite plugin

```ts
// vite.config.ts
import { tinkerCompiler } from "@tinker/compiler";
import { standardDecorators } from "./decorators.ts"; // your decorator transform

export default {
  // The plugin reads the decorators, so it is listed before the decorator transform.
  plugins: [tinkerCompiler(), standardDecorators()],
};
```

The plugin checks each component's template in every `.ts` or `.tsx` file it
transforms. An error fails the build, and names the file, the component, and the
line and column inside the template:

```
clock.ts: <Clock>: Missing a name at the end (...), at line 1, column 4 of the template
```

Options:

| Option | Default | What it does |
|---|---|---|
| `emit` | `false` | Replace each compiled template with its tree. Costs bundle size: see [The cost of `emit`](#the-cost-of-emit). |
| `dev` | Vite's development mode | Whether the app runs in development mode: apps read it as the `DEV_MODE` token (`inject(DEV_MODE)`). The build defines `globalThis.__TINKER_DEV__`; without the plugin, `DEV_MODE` is `false`. |

## What is checked, and what is skipped

A component is checked when its template, its `imports` list, and each imported
directive's selector can be read:

- a string literal, or a template literal with no `${}`;
- a `const` that is a string literal, or built from such constants with `+` and template
  literals with `${}`. A constant may be built from constants of the same file, or of a
  file it imports from, through as many imports as it takes. A constant that depends on
  itself has no text.

Anything else (a value computed at run time, a `let`, a number) is skipped. Strict mode
fails the build for it instead.

## A component's template and CSS files

A component can name its template and its stylesheet as files, instead of writing
`template` and `styles` inline:

```ts
@Component({
  selector: "tk-notice",
  templateUrl: "./notice.html",
  styleUrls: ["./notice.css", "./notice-colors.css"],
})
export class Notice {}
```

Each path is relative to the source file. The plugin reads each file and puts it in
place of its property:

- `styleUrls`: the files' text becomes `styles`, so the CSS is scoped exactly as inline
  `styles` are. It takes a list, one file or more: the files are joined in the order listed.
- `templateUrl`: the file's text becomes `template`. The file is checked as a template
  is, and its errors are reported against it. With `emit`, the compiled tree replaces it,
  as for an inline template.

Both happen with or without `emit`, because a component needs its template and CSS at
run time. The plugin watches the files: an edit rebuilds the component that reads them.

- **Keep the files in the component's folder**: `notice/notice.ts`, `notice/notice.html`
  and `notice/notice.css`, one folder per component. See `examples/basics/src/features/examples/demos/notice`.
- `styleUrls` must be a list: a string fails the build. `templateUrl` takes one string.
  A missing file fails the build and names the file.
- An inline option and its file together (`template` with `templateUrl`, `styles` with
  `styleUrls`) fail the build: give one of them.
- A file option that is not a string literal is skipped with a warning, as a template is.
- Without the plugin, `@Component` throws, since nothing would read the files.
- `tinker-compile` inlines the files too, so a built library needs neither file.

## The commands

Both read a library's files from disk, without Vite. They follow three kinds of
import, each read as TypeScript source:

- relative imports (`./card.ts`);
- path aliases of the nearest `tsconfig.json`, with `*` as in TypeScript;
- packages, through their `development` export when that is a `.ts` file. A package
  that ships only built JavaScript is not followed: its decorators are compiled away.

### `tinker-check`

```bash
tinker-check <file.ts>...
```

Checks each file and changes nothing. It exits with 1 when a template does not compile.

### `tinker-compile`

```bash
tinker-compile --out <dir> [--package <package.json>] [--emit] <file.ts>...
```

Writes each file into `<dir>`, at its path relative to the working directory:

- Without `--emit`, the file keeps its template strings. Each template is still checked.
- With `--emit`, each compiled template is replaced by its tree.
- The output is TypeScript. The library's own build compiles it, decorators included.
- `--package` names the library's manifest (default `package.json`). The command fails,
  and writes nothing, when the manifest does not declare `@tinker/functional` and
  `@tinker/core`, because the compiled files import them.
- A file that does not compile is reported, and nothing is written for it. A file outside
  the working directory is an error.

### `tinker-types`

```bash
tinker-types <path>...
```

Writes a type-check file next to each source file that has an exported component with
a checkable template: `page.ts` gets `page.template-check.ts`. The file has one function
per component, `check_<Name>($c: <Name>)`, whose body is the template's expressions as
TypeScript, so `tsc` reports a wrong argument type, or a call of a field that is not a
function. The root `npm run typecheck` runs it over `packages` and `examples`; the files
are git-ignored and rewritten each run.

- A component whose class is not exported gets a warning and no file.
- A template that does not compile, a computed template, or a `templateUrl` is not checked.
- `@map`: the list must be an array, and each name its `let` binds is typed from the
  list's items. `let todo` is an item, `let { id }` its `id` field, `let [first, ...rest]`
  its first item and the rest. A field the items do not have, or an index past a tuple's
  end, is a type error, as the run time would throw. `some(x)`, `ok(x)` and `error(x)` type
  `x` as the value of a `Maybe`'s `Some`, or of an `Either`'s `Right` or `Left`; a name
  of an alternative (`ok(v) | error(v)`) is the union of its types in the options; a regex
  group is `string | undefined`. The `track` expression is checked in the row's scope, and
  `track { id }` checks that the items have `id`.
- `@case`: each name a case binds is typed from the subject, narrowed by the case's
  pattern as the run time matches it. A literal field picks the cases of a union that have
  it (`@case { kind: "circle", radius }` reads `radius` on the circle), a `typeof` test
  (`number`) its type, `present` drops `null` and `undefined`, and an object pattern keeps
  the cases that have every key it reads and none of its `absent` keys. The guard is
  checked with those names. A field the narrowed cases do not have is a type error.
- References: `#name` is its element (`HTMLInputElement` for an `<input>`, `HTMLElement`
  for a tag the DOM does not type), `##name` the element's component, and
  `#name="exportAs"` the directive or component with that exportAs.
- Handlers are checked as calls, with `$event` typed. When a directive or the component on
  the element has an output of that name (or a model whose `<name>Change` it is), `$event`
  is its value; otherwise it is the DOM event (`PointerEvent` for `click`, `Event` for one
  the DOM does not type). `(owner.name)` reads only that owner's output, or the DOM event
  it falls back to. At run time both the output and a DOM event of that name call the
  handler; the check takes the output's value.
- A directive whose class is not exported, or whose base classes cannot be read, is not
  typed: references to it and `$event` on its element are `any`. `let-` names are `any`:
  the context that gives them is a value of the run time.

`examples/library` is a sample library built this way (`--emit`), with its
`package.json` and `tsconfig.build.json` as a reference.

## The build settings: `tinkerConfig()`

`tinkerConfig()` gives the build settings of a Tinker app, as one call: its `plugins` (the
compile step with `emit: true`, the standard decorators step, and the `<base>` element) and its
`aliases` (the workspace packages, read from their source). `tinker new` writes the app's
`vite.config.ts` from it:

```ts
import { tinkerConfig } from "@tinker/compiler";

const config = tinkerConfig();

export default {
  plugins: [...config.plugins],
  resolve: { alias: [...config.aliases] },
};
```

The app does not name the build tool. `tinker dev` and `tinker build` (see `docs/cli.md`) run it,
through `@tinker/cli`.

The aliases read the `packages/` folder of this repository, so the preset works for an app
inside the monorepo, as a workspace package. An app outside it needs the packages installed,
and gets no aliases from the preset.

## The cost of `emit`

An emitted tree is about 2.2 times the gzipped size of its template string, but the whole
bundle grows by much less. Measured on the example app, in headless Chromium on one
machine, 40 loads of each build, alternating:

- Time from navigation to all four components rendered: median 47 ms with template
  strings, 39.1 ms with emitted trees (p90 58.4 ms and 44.9 ms).
- Bundle: 193,704 bytes raw and 37,617 gzipped with strings; 221,593 raw and 38,436
  gzipped with trees (about 0.8 KB more gzipped).

For this app the trees are worth their size, and the example app uses them
(`tinkerCompiler({ emit: true })`). Each build chooses: `--emit` writes the trees, and
without it the output keeps the template strings. A library's consumers pay the bundle
size, so the measurements above come from one app and do not decide the default for
libraries.

## Errors

Every syntax error in a template is reported, not only the first. A problem inside a
text, an element, or a block is located at the innermost one. Block errors, such as an
`@else` with no `@if`, are located too.

## Limits

The known limits, and what would close each, are in `IMPROVEMENTS.md` under
"Build-time template compiler", "Checking a library without Vite", and
"Compiling a library".
