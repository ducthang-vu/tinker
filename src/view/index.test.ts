import { expect, test } from "vitest";
import * as view from "./index.ts";

test("the public API exports exactly these values", () => {
  expect(Object.keys(view).sort()).toEqual(
    [
      "BrowserTemplateParser",
      "Component",
      "DOCUMENT",
      "Directive",
      "DomRenderer",
      "Engine",
      "InputNotBoundError",
      "RENDERER",
      "TEMPLATE_PARSER",
      "View",
      "ViewContainerRef",
      "ChangeDetectionLoopError",
      "input",
      "Effects",
      "Effect",
      "RenderHooks",
      "AfterEachRender",
      "AfterNextRender",
    ].sort(),
  );
});
