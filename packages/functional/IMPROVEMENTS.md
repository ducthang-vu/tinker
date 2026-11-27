# Improvements to do in `@tinker/functional`

Known limitations of the functional library, written down so they are not forgotten. Each entry
says what the problem is, why it matters, and what to do. The gaps of the rest of the repository
are in the [root IMPROVEMENTS.md](../../IMPROVEMENTS.md).

## Optics (`src/lib/optics/`)

### 1. Only three kinds of optic

**Problem.** There are Isos, Lenses and Optionals. A case of a union (a Prism) and every item of
a list at once (a Traversal) have no optic yet, so a form over a union, or "touch every field",
must be written by hand.

**To do.** Add `Prism` (`preview`, `review`) and `Traversal` (`getAll`, `modify`), with their laws
in `@tinker/functional/testing`, and extend the kinds table of `compose`.

### 2. `prop` copies a record into a plain object

**Problem.** `prop`'s `set` copies with a spread, so a class instance comes back as a plain object
without its prototype.

**To do.** Nothing for records. If optics over class instances are wanted, add a lens that copies
through a `with`-style method of the class.

### 3. `byKey` loses its item when `set` changes the key

**Problem.** `byKey(keyOf, key).set(item, list)` writes `item` even when its key is not `key`.
The Optional then no longer finds it, which breaks the set-preview law.

**To do.** Decide whether such a write is refused (the list is returned as it was), or reported
in development mode.
