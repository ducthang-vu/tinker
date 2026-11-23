import { describe, expect, test } from "vitest";
import { inputNamesOf, registerInputNames } from "./input-names.ts";

describe("input names", () => {
  test("a class knows the template names it registered, and none otherwise", () => {
    class Registered {}
    class Unregistered {}
    registerInputNames(Registered, { label: "title" });
    expect(inputNamesOf(Registered))
      .toEqual({ label: "title" });
    expect(inputNamesOf(Unregistered))
      .toEqual({});
  });

  test("a registration is copied, so later changes to the argument do not change it", () => {
    class Copied {}
    const names: Record<string, string> = { label: "title" };
    registerInputNames(Copied, names);
    names.label = "changed";
    expect(inputNamesOf(Copied))
      .toEqual({ label: "title" });
  });
});
