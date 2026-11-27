# The `tinker` command (`packages/cli`)

`tinker` creates a Tinker app, and runs it: `new`, `dev` and `build`.

## `tinker new <name> [--dir <parent>]`

Writes a new app into `<parent>/<name>`. The parent is the current folder unless `--dir` gives
one. The name is a package name: lower case letters, digits and dashes, starting with a letter.
The folder must not exist yet, or must be empty, so nothing is overwritten.

`--prefix <prefix>` sets the prefix of the app's component selectors, default `app`: lower case
letters and digits, starting with a letter. The root component's selector is `<prefix>-app`, and
the prefix is stored in `package.json` under `tinker.prefix`, for the generators.

The app has:

- `package.json`: the scripts `dev` (`tinker dev`), `build` (`tinker build`) and `preview`
  (`tinker preview`), the Tinker
  packages as dependencies, and `@tinker/cli`.
- `index.html`, which holds the root element `<tk-app>`.
- `vite.config.ts`, which takes its plugins and aliases from `tinkerConfig()` of `@tinker/compiler`
  (see `docs/compiler.md`).
- `src/main.ts`, which bootstraps the root component, and `src/app.ts`, the root component.
- `tsconfig.json`, strict TypeScript for the app's `src/` and its `vite.config.ts`, with the `.ts`
  import paths the app uses. It has the `typecheck` script (`tsc --noEmit`).
- `.gitignore`, which keeps `node_modules/`, `dist/` and logs out of git.
- `README.md`, with the commands: install, dev, build, preview and typecheck.

Then, in the app's folder:

```bash
npm install
npm run dev
```

## `tinker dev`, `tinker build` and `tinker preview`

Run in the app's folder. They use Vite, which is a dependency of `@tinker/cli`, so the app does
not name it.

- `tinker dev [--port <n> | -p <n>] [--base <path>]` serves the app with Vite's dev server, and
  keeps running until it is stopped. The port is a number from 1 to 65535; without `--port` Vite
  picks its default. `--port=<n>` works too.
- `tinker build [--base <path>]` builds the app into its `dist/` folder.
- `tinker preview [--port <n> | -p <n>] [--base <path>]` serves the built `dist/` folder, as a
  host would, until it is stopped. It needs `tinker build` first: without `dist/`, it refuses.

`--base` is the folder the app is served under. It starts and ends with `/`, such as
`/tinker/` for a project site on GitHub Pages; the default is `/`. Both commands write it into
the page's `<base>` element, which the router reads, so the app routes correctly under that
folder. A path that does not start and end with `/` is refused.

## `tinker generate <kind> <name> [--dry-run]`

Run in an app's folder (its `package.json` has `tinker.prefix`). It writes the new item's files (see the kinds below),
and registers the item in the root component, `src/app.ts`: an import,
and an entry in the component's `imports`. A service is not registered, since it is provided in
the root injector. The kinds:

- `component`: a folder `src/<name>/` with `<name>.ts`, a `@Component` with the selector `<prefix>-<name>`
  and a class `<Name>Component`, and `<name>.test.ts`, a test file that imports it.
- `directive`: `@Directive` with the attribute selector `[<prefix>-<name>]`, and a class `<Name>Directive`.
- `service`: `@Injectable({ providedIn: "root" })`, and a class `<Name>Service`.
- `function`: a template function named in camel case (`format-price` is `formatPrice`), with a
  `call()` method, and a class `<Name>Function`.

Everything is checked before anything is written: an app without a root component file, an
imports list over several lines, or an existing item stops the command with nothing changed.
`--dry-run` shows the files to create and the new `src/app.ts`, and writes nothing.

The name is lower case letters, digits and dashes.

## Tests of a generated app

A new app has `npm test`, which runs the tests with Node's built-in test runner (`node:test`), so
the app needs no test framework. A vitest route is also described below. Both work with the
components `tinker generate component` writes, which come with a test file.

### With Node's test runner (the default)

Requirements: Node 22.6 or later, for `--experimental-strip-types`.

```bash
npm install
npm test
```

`npm test` runs:

```bash
node --experimental-strip-types --conditions=development --import ./register.mjs --test "src/**/*.test.ts"
```

- `--experimental-strip-types` lets Node run TypeScript, after the loader has transformed it.
- `--conditions=development` makes `@tinker/*` resolve to their source in this repository. Outside
  it, the packages are built, and the flag does nothing.
- `--import ./register.mjs` loads the **loader**, the file `hooks.mjs`. For each `.ts` file the tests
  load (not a dependency), it runs Babel: the decorators of Tinker (`@Component`, `@Injectable`, …),
  then the removal of the TypeScript types. This is the transform the build of the app takes, so
  a decorated component loads in a test as it does in the app. There is no build step for the tests:
  the transform runs as each module loads.
- `--test "src/**/*.test.ts"` runs each test file under `src/`.

A test is written with `node:test` and `node:assert/strict`:

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CartComponent } from "./cart.ts";

describe("CartComponent", () => {
  test("is created", () => {
    assert.ok(new CartComponent() instanceof CartComponent);
  });
});
```

The script does not add a coverage report or a watch mode. Node's runner has options for both,
which can be added to the script, but they are not set up here.

### With vitest

vitest reads the app's `vite.config.ts`, which carries the same Tinker settings as the build, so a
decorated component loads in it with no loader.

1. Install vitest, in the app:

   ```bash
   npm install --save-dev vitest
   ```

2. Add a script to `package.json`:

   ```json
   "test:vitest": "vitest run"
   ```

3. Change the imports of each test file to vitest's. For the component above:

   ```ts
   import { describe, expect, test } from "vitest";
   import { CartComponent } from "./cart.ts";

   describe("CartComponent", () => {
     test("is created", () => {
       expect(new CartComponent()).toBeInstanceOf(CartComponent);
     });
   });
   ```

4. Run it:

   ```bash
   npm run test:vitest
   ```

vitest does not use `register.mjs` or `hooks.mjs`, so they can be deleted in a vitest-only app.
In this repository, vitest is already installed, so `npx vitest run` works in a generated app
inside the workspace (checked with `tinker generate component` and the change above).

## `--help` and `--version`

- `tinker` with no command, `tinker --help`, `tinker -h` and `tinker help` print the list of
  commands and options, and exit with 0. `--help` after a command (such as `tinker dev --help`)
  prints the same list and runs nothing.
- `tinker --version` and `tinker -v` print the version of `@tinker/cli`, and exit with 0.

## Exit codes

- 0: the command succeeded.
- 1: `dev` or `build` failed. The message is on stderr.
- 2: a usage or input error, such as a missing name, an invalid name, an invalid port or base,
  an unknown option, or an unknown command.
  The message is on stderr.

## What it does not do

- The generated app depends on the Tinker packages as workspace packages (`"*"`). Those are
  private, so the app must be created inside this repository's workspace, under `examples/` or
  `packages/`, for `npm install` to link them. See `IMPROVEMENTS.md`.
