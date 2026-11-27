// The template compiler's public API, for build steps: it is exported as
// "@tinker/core/compiler", not from the runtime entry point, so an app that
// only ships compiled output does not bundle it.

export { compileSource, type ImportedSelector } from "./compile-source.ts";
export { emitCompiled } from "./emit.ts";
export { BUILT_IN_NAMES } from "../internal/template/built-in-functions.ts";
export { forbiddenMembersIn, namesIn, unknownReads } from "../internal/template/template-names.ts";
export { shadowsIn } from "../internal/template/template-shadows.ts";
export { Selector } from "../internal/template/selector.ts";
export type { CompiledNode } from "../internal/template/compile.ts";
export type { Expression } from "../internal/template/expression.ts";
export { TemplateCompileError } from "../internal/template/compile-error.ts";
