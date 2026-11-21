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
| `emit` | `false` | Replace each compiled template with its tree. Costs bundle size: see `IMPROVEMENTS.md`. |
| `strict` | `false` | Fail the build for a component that cannot be checked. By default it is skipped with a warning. |

## What is checked, and what is skipped

A component is checked when its template, its `imports` list, and each imported
directive's selector can be read:

- a string literal, or a template literal with no `${}`;
- a `const` of the same file that is a string literal;
- a `const` of a file it imports from, read one level deep.

Anything else (a value computed at run time, a `let`, a constant that is itself
computed) is skipped. Strict mode fails the build for it instead.

## The commands

Both read a library's files from disk, without Vite. They follow only relative
imports, so an import from a package is not read.

### `tinker-check`

```bash
tinker-check [--strict] <file.ts>...
```

Checks each file and changes nothing. It exits with 1 when a template does not compile,
or, in strict mode, when a component cannot be checked.

### `tinker-compile`

```bash
tinker-compile --out <dir> [--package <package.json>] [--strict] [--emit] <file.ts>...
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

`examples/library` is a sample library built this way (`--emit`), with its
`package.json` and `tsconfig.build.json` as a reference.

## Errors

Every syntax error in a template is reported, not only the first. A problem inside a
text, an element, or a block is located at the innermost one. Block errors, such as an
`@else` with no `@if`, are located too.

## Limits

The known limits, and what would close each, are in `IMPROVEMENTS.md` under
"Build-time template compiler", "Checking a library without Vite", and
"Compiling a library".
