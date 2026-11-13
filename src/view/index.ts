// The public entry point for the view layer. Everything users may import is
// listed here explicitly; element contexts, factories and input bindings
// stay internal.

// Starting an app
export { Engine, type EngineOptions } from "./engine.ts";

// Writing components and directives
export { Component, type ComponentMetadata, Directive, type DirectiveMetadata } from "./authoring/decorators.ts";
export { input, InputNotBoundError, type InputName, type InputSignal, type InputValue } from "./authoring/input.ts";

// What the engine creates and hands back
export { View } from "./runtime/view.ts";
export { ViewContainerRef } from "./runtime/view-container-ref.ts";
export { ViewScheduler } from "./runtime/view-scheduler.ts";

// What can be replaced through providers
export { DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./tokens.ts";
export { DomRenderer, type Renderer } from "./renderer.ts";
export type { TemplateParser } from "./template/parser.ts";
export type { AttributeNode, ElementNode, TemplateNode, TextNode } from "./template/ast.ts";
export { BrowserTemplateParser } from "./template/browser-parser.ts";
