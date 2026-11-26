# The `tinker` command (`packages/cli`)

`tinker` creates a Tinker app, and runs it: `new`, `dev` and `build`.

## `tinker new <name> [--dir <parent>]`

Writes a new app into `<parent>/<name>`. The parent is the current folder unless `--dir` gives
one. The name is a package name: lower case letters, digits and dashes, starting with a letter.
The folder must not exist yet, or must be empty, so nothing is overwritten.

The app has:

- `package.json`: the scripts `dev` (`tinker dev`), `build` (`tinker build`) and `preview`
  (`tinker preview`), the Tinker
  packages as dependencies, and `@tinker/cli`.
- `index.html`, which holds the root element `<tk-app>`.
- `vite.config.ts`, which takes its plugins and aliases from `tinkerConfig()` of `@tinker/compiler`
  (see `docs/compiler.md`).
- `src/main.ts`, which bootstraps the root component, and `src/app.ts`, the root component.

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
