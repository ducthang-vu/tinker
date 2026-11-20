import { expect, test } from "vitest";
import * as compiler from "./index.ts";

test("the compiler's public API exports exactly these values", () => {
  expect(Object.keys(compiler))
    .toEqual(["compileSource", "emitCompiled", "Selector", "TemplateCompileError"]);
});
