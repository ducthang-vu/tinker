import { describe, expect, test } from "vitest";
import { provide } from "../../di/index.ts";
import { Engine } from "./engine.ts";
import { DEV_MODE } from "./tokens.ts";

describe("DEV_MODE", () => {
  test("is off without the compiler's build constant, and a provider can set it", () => {
    expect(Engine.create()
      .get(DEV_MODE))
      .toBe(false);
    expect(Engine.create({ providers: [provide(DEV_MODE, { useValue: true })] })
      .get(DEV_MODE))
      .toBe(true);
  });
});
