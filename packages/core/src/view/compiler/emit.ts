// Writes a compiled template as JavaScript: an expression that rebuilds the same
// nodes. A build step puts it in the component's decorator in place of the
// template string, so the app skips the parse and the compile at run time.
//
// The expression refers to `Maybe` (from @tinker/functional), `Selector` (from
// @tinker/core/compiler), and each component or directive class by the name given
// for it. The module it is put in must have all of them in scope; the names of
// `Maybe` and `Selector` can be changed, for a module that declares those already.
// Anything the tree holds that this cannot write faithfully is an error, not a guess.

import { Maybe } from "@tinker/functional";
import type { Class } from "../../utils/types.ts";
import type { CompiledNode } from "../internal/template/compile.ts";
import { Selector } from "../internal/template/selector.ts";
import { type Either, Left, map, match, Right, sequence } from "@tinker/functional/v1";

/** The names the expression uses for `Maybe` and `Selector`. */
export interface EmitHelpers {
  readonly Maybe: string;
  readonly Selector: string;
}

/** What the emitter knows about the module the expression is put in. */
interface Scope {
  readonly names: ReadonlyMap<Class<object>, string>;
  readonly helpers: EmitHelpers;
}

/**
 * The JavaScript expression for `nodes`, or an error for a value that cannot be written.
 * `names` gives the name of each class the tree refers to; a class missing from it is an error.
 */
export function emitCompiled(
  nodes: readonly CompiledNode[],
  names: ReadonlyMap<Class<object>, string>,
  helpers: EmitHelpers = { Maybe: "Maybe", Selector: "Selector" },
): Either<string, Error> {
  return emitValue(nodes, { names, helpers });
}

function emitValue(value: unknown, scope: Scope): Either<string, Error> {
  if (value === undefined) {
    return Right.of("undefined");
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return Right.of(JSON.stringify(value));
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? Right.of(String(value))
      : Left.of(new Error(`Cannot emit ${value}: only finite numbers can be written`));
  }
  if (Array.isArray(value)) {
    return map(sequence(value.map((item) => emitValue(item, scope))), (items) =>
      `[${items.join(", ")}]`);
  }
  if (value instanceof Maybe) {
    return value.match({
      some: (inner) => map(emitValue(inner, scope), (text) => `${scope.helpers.Maybe}.some(${text})`),
      none: () => Right.of(`${scope.helpers.Maybe}.none()`),
    });
  }
  if (value instanceof Selector) {
    return Right.of(`${scope.helpers.Selector}.parseValid(${JSON.stringify(value.source)})`);
  }
  if (typeof value === "function") {
    return nameOf(value as Class<object>, scope.names);
  }
  if (isPlainObject(value)) {
    return emitObject(value, scope);
  }
  return Left.of(new Error(`Cannot emit ${Object.prototype.toString.call(value)}: it is not plain data, a Maybe, a Selector or a class`));
}

function emitObject(value: object, scope: Scope): Either<string, Error> {
  return map(
    sequence(Object.entries(value)
      .map(([key, field]) =>
        map(emitValue(field, scope), (text) => `${JSON.stringify(key)}: ${text}`))),
    (fields) => `{ ${fields.join(", ")} }`,
  );
}

function nameOf(
  type: Class<object>,
  names: ReadonlyMap<Class<object>, string>,
): Either<string, Error> {
  const name = names.get(type);
  return name === undefined
    ? Left.of(new Error(`Cannot emit the class ${type.name || "(anonymous)"}: it has no name in the module`))
    : Right.of(name);
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
