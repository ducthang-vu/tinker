import { expect, test } from "vitest";
import * as view from "./index.ts";

test("the public API exports exactly these values", () => {
  expect(Object.keys(view)
    .sort())
    .toEqual(
      [
        "BrowserTemplateParser",
        "Component",
        "DOCUMENT",
        "ElementRef",
        "Directive",
        "DomRenderer",
        "bootstrap",
        "AppRef",
        "InputNotBoundError",
        "RENDERER",
        "TEMPLATE_PARSER",
        "ComponentRef",
        "ViewContainerRef",
        "ChangeDetectionLoopError",
        "input",
        "output",
        "viewChildren",
        "model",
        "Effects",
        "Effect",
        "RenderHooks",
        "AfterEachRender",
        "AfterNextRender",
      ].sort(),
    );
});
