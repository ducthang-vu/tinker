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
import { match } from "@tinker/functional/v1";

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
 * The JavaScript expression for `nodes`. `names` gives the name of each class the
 * tree refers to; a class missing from it is an error.
 */
export function emitCompiled(
  nodes: readonly CompiledNode[],
  names: ReadonlyMap<Class<object>, string>,
  helpers: EmitHelpers = { Maybe: "Maybe", Selector: "Selector" },
): string {
  return emitValue(nodes, { names, helpers });
}

function emitValue(value: unknown, scope: Scope): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot emit ${value}: only finite numbers can be written`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => emitValue(item, scope))
      .join(", ")}]`;
  }
  if (value instanceof Maybe) {
    return match(value, { Some: (inner) => `${scope.helpers.Maybe}.some(${emitValue(inner, scope)})`, None: () => `${scope.helpers.Maybe}.none()` });
  }
  if (value instanceof Selector) {
    return `${scope.helpers.Selector}.parse(${JSON.stringify(value.source)})`
      + ".match({ left: (error) => { throw error; }, right: (value) => value })";
  }
  if (typeof value === "function") {
    return nameOf(value as Class<object>, scope.names);
  }
  if (isPlainObject(value)) {
    return emitObject(value, scope);
  }
  throw new Error(`Cannot emit ${Object.prototype.toString.call(value)}: it is not plain data, a Maybe, a Selector or a class`);
}

function emitObject(value: object, scope: Scope): string {
  const fields = Object.entries(value)
    .map(([key, field]) => `${JSON.stringify(key)}: ${emitValue(field, scope)}`);
  return `{ ${fields.join(", ")} }`;
}

function nameOf(type: Class<object>, names: ReadonlyMap<Class<object>, string>): string {
  const name = names.get(type);
  if (name === undefined) {
    throw new Error(`Cannot emit the class ${type.name || "(anonymous)"}: it has no name in the module`);
  }
  return name;
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
