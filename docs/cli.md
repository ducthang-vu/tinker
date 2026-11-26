# The `tinker` command (`packages/cli`)

`tinker` creates a new Tinker app. It has one command so far.

## `tinker new <name> [--dir <parent>]`

Writes a new app into `<parent>/<name>`. The parent is the current folder unless `--dir` gives
one. The name is a package name: lower case letters, digits and dashes, starting with a letter.
The folder must not exist yet, or must be empty, so nothing is overwritten.

The app has:

- `package.json`: scripts `dev`, `build` and `preview` (Vite), and the Tinker packages as
  dependencies.
- `index.html`, which holds the root element `<tk-app>`.
- `vite.config.ts`, which spreads `tinkerVite()` from `@tinker/compiler` (see
  `docs/compiler.md`).
- `src/main.ts`, which bootstraps the root component, and `src/app.ts`, the root component.

Then, in the app's folder:

```bash
npm install
npm run dev
```

The exit code is 0 when the app is written, and 2 for a usage or input error, with the
message on stderr.

## What it does not do

- It does not create a dev or build script of its own. `npm run dev` and `npm run build` run
  Vite directly, through the preset.
- The generated app depends on the Tinker packages as workspace packages (`"*"`). Those are
  private, so the app must be created inside this repository's workspace, under `examples/` or
  `packages/`, for `npm install` to link them. See `IMPROVEMENTS.md`.
