// Writes a compiled template as JavaScript: an expression that rebuilds the same
// nodes. A build step puts it in the component's decorator in place of the
// template string, so the app skips the parse and the compile at run time.
//
// The expression refers to `Maybe` (from @tinker/functional), `Selector` (from
// @tinker/core/compiler), and each component or directive class by the name given
// for it. The module it is put in must have all of them in scope. Anything the tree
// holds that this cannot write faithfully is an error, not a guess.

import { Maybe } from "@tinker/functional";
import type { Class } from "../../utils/types.ts";
import type { CompiledNode } from "../internal/template/compile.ts";
import { Selector } from "../internal/template/selector.ts";

/**
 * The JavaScript expression for `nodes`. `names` gives the name of each class the
 * tree refers to; a class missing from it is an error.
 */
export function emitCompiled(
  nodes: readonly CompiledNode[],
  names: ReadonlyMap<Class<object>, string>,
): string {
  return emitValue(nodes, names);
}

function emitValue(value: unknown, names: ReadonlyMap<Class<object>, string>): string {
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
    return `[${value.map((item) => emitValue(item, names))
      .join(", ")}]`;
  }
  if (value instanceof Maybe) {
    return value.match({
      some: (inner) => `Maybe.some(${emitValue(inner, names)})`,
      none: () => "Maybe.none()",
    });
  }
  if (value instanceof Selector) {
    return `Selector.parse(${JSON.stringify(value.source)}).getOrThrow()`;
  }
  if (typeof value === "function") {
    return nameOf(value as Class<object>, names);
  }
  if (isPlainObject(value)) {
    return emitObject(value, names);
  }
  throw new Error(`Cannot emit ${Object.prototype.toString.call(value)}: it is not plain data, a Maybe, a Selector or a class`);
}

function emitObject(value: object, names: ReadonlyMap<Class<object>, string>): string {
  const fields = Object.entries(value)
    .map(([key, field]) => `${JSON.stringify(key)}: ${emitValue(field, names)}`);
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
