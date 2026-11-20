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
        "booleanAdapter",
        "numberAdapter",
        "RENDERER",
        "TEMPLATE_PARSER",
        "ComponentRef",
        "ViewContainerRef",
        "ChangeDetectionLoopError",
        "input",
        "output",
        "queryAll",
        "query",
        "Outlet",
        "QueryMissingError",
        "model",
        "Effects",
        "Effect",
        "RenderHooks",
        "AfterEachRender",
        "AfterNextRender",
        // Private API, marked @privateAPI: for the testing helpers only.
        "Engine",
        "inputsOf",
        "outputsOf",
        "CLASS_REPLACEMENTS",
        "getComponentMetadata",
        "getDirectiveMetadata",
      ].sort(),
    );
});
