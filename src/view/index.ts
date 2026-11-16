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
export { input, InputNotBoundError, type InputName, type InputSignal, type InputValue } from "./internal/authoring/input.ts";

// What the engine creates and hands back
export { ComponentRef } from "./internal/component-ref.ts";
export { ViewContainerRef } from "./internal/runtime/view-container-ref.ts";
export { ChangeDetectionLoopError } from "./internal/runtime/change-detection.ts";

// What can be replaced through providers
export { DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./internal/tokens.ts";
export { ElementRef } from "./internal/runtime/element-ref.ts";
export { DomRenderer, type Renderer } from "./internal/renderer.ts";
export type { TemplateParser } from "./internal/template/parser.ts";
export type { AttributeNode, ElementNode, TemplateNode, TextNode } from "./internal/template/ast.ts";
export { BrowserTemplateParser } from "./internal/template/browser-parser.ts";
