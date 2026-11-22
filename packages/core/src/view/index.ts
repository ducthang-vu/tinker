// The public entry point for the view layer. Everything users may import is
// listed here explicitly; element contexts, factories and input bindings
// stay internal.

// Starting an app
export { bootstrap, AppRef, type BootstrapOptions } from "./bootstrap.ts";

// Writing components and directives
export { Component, type ComponentMetadata, Directive, type DirectiveMetadata } from "./internal/authoring/decorators.ts";
export { Effect, type EffectContext, Effects, type EffectFn } from "./internal/authoring/effects.ts";
export { AfterEachRender, AfterNextRender, RenderHooks } from "./internal/authoring/render-hooks.ts";
export { output, type Output, type OutputName, type OutputValue } from "./internal/authoring/output.ts";
export { model, type ModelSignal } from "./internal/authoring/model.ts";
export { queryAll, type QueryOptions } from "./internal/authoring/query.ts";
export { query, QueryMissingError } from "./internal/authoring/query.ts";
export { Outlet } from "./internal/authoring/outlet.ts";
export type { TemplateContext, TemplateRef } from "./internal/runtime/template-ref.ts";
export { input, InputNotBoundError, type InputName, type InputSignal, type InputValue } from "./internal/authoring/input.ts";
export { type InputOptions } from "./internal/authoring/input.ts";
export { booleanAdapter, numberAdapter } from "./internal/authoring/input-adapters.ts";

// What the engine creates and hands back
export { ComponentRef } from "./internal/component-ref.ts";
export { ViewContainerRef } from "./internal/runtime/view-container-ref.ts";
export { ChangeDetectionLoopError } from "./internal/runtime/change-detection.ts";

// What can be replaced through providers
export { DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./internal/tokens.ts";
export { ElementRef } from "./internal/runtime/element-ref.ts";
export { Sanitizer, TrustedUrl, TrustedHtml, TrustedStyle } from "./internal/runtime/sanitization.ts";
export { DomRenderer, type Renderer } from "./internal/renderer.ts";
export type { TemplateParser } from "./internal/template/parser.ts";
export type { AttributeNode, ElementNode, TemplateNode, TextNode } from "./internal/template/ast.ts";
export { TemplateSyntaxError, TinkerTemplateParser } from "./internal/template/tinker-parser.ts";

// Private API: for the testing helpers only. Each is marked @privateAPI in its doc:
// do not use it in an app, unless you accept that it may change without notice.
export { Engine, type EngineOptions } from "./internal/engine.ts";
export { inputsOf } from "./internal/authoring/input.ts";
export { inputNamesOf, registerInputNames } from "./internal/authoring/input-names.ts";
export { outputsOf } from "./internal/authoring/output.ts";
export { getComponentMetadata, getDirectiveMetadata } from "./internal/authoring/decorators.ts";
export { CLASS_REPLACEMENTS } from "./internal/tokens.ts";
