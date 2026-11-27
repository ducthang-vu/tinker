# The `tinker` command (`packages/cli`)

`tinker` creates a Tinker app, and runs it: `new`, `dev` and `build`.

## `tinker new <name> [--dir <parent>]`

Writes a new app into `<parent>/<name>`. The parent is the current folder unless `--dir` gives
one. The name is a package name: lower case letters, digits and dashes, starting with a letter.
The folder must not exist yet, or must be empty, so nothing is overwritten.

`--prefix <prefix>` sets the prefix of the app's component selectors, default `app`: lower case
letters and digits, starting with a letter. The root component's selector is `<prefix>-root`, and
the prefix is stored in `tinker.json`, for the generators.

`--test-runner <vitest|node>` sets the test runner, default `vitest` (see the tests section below).

`--install` runs `npm install` in the new app, after it is written. If the install fails, the
command exits with 1 and says where to run it.

The app has:

- `tinker.json`, the app's settings: its selector `prefix`, and its `testRunner` when that is not
  the default `vitest` (a node app records `"testRunner": "node"`). Apps made before
  this file had them under the `tinker` key of `package.json`, which is still read.
- `package.json`: the scripts `dev` (`tinker dev`), `build` (`tinker build`) and `preview`
  (`tinker preview`), the Tinker
  packages as dependencies, and `@tinker/cli`.
- `index.html`, which holds the root element `<prefix>-root`.
- `vite.config.ts`, which takes its plugins and aliases from `tinkerConfig()` of `@tinker/compiler`
  (see `docs/compiler.md`).
- `src/main.ts`, which bootstraps the root component, and `src/app.ts`, the root component.
- `tsconfig.json`, strict TypeScript for the app's `src/` and its `vite.config.ts`, with the `.ts`
  import paths the app uses. It has the `typecheck` script (`tsc --noEmit`).
- `.gitignore`, which keeps `node_modules/`, `dist/` and logs out of git.
- `README.md`, with the commands: install, dev, build, preview, typecheck and test.

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

Run in an app's folder (its `tinker.json` has the prefix). It writes the new item's files (see the kinds below),
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

A new app runs its tests with **vitest** by default: `npm test` runs `vitest run`, and vitest is a
dev dependency of the app, so there is nothing to install. Pass `--test-runner node` to
`tinker new` for Node's built-in test runner (`node:test`) instead; the app then needs no test
framework. A node app declares `"engines": { "node": ">=22.6" }` in its `package.json`. The runner is stored in `tinker.json`, and
`tinker generate component` writes the test file of that runner.

```bash
tinker new shop                          # vitest (the default)
tinker new shop --test-runner node       # Node's built-in runner
```

Both runners load the same Tinker code, decorators included, and both test a component the same way.

### With vitest (the default)

vitest reads the app's `vite.config.ts`, which carries the same Tinker settings as the build, so a
decorated component loads in a test with no extra setup. A generated component's test:

```ts
import { describe, expect, test } from "vitest";
import { CartComponent } from "./cart.ts";

describe("CartComponent", () => {
  test("is created", () => {
    expect(new CartComponent()).toBeInstanceOf(CartComponent);
  });
});
```

```bash
npm install
npm test          # runs vitest run
npx vitest        # watch mode, and the rest of vitest's options
```

### With Node's test runner (`--test-runner node`)

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

A generated component's test:

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
