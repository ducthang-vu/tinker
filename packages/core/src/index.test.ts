import { expect, test } from "vitest";
import * as di from "./di/index.ts";
import * as functional from "@tinker/functional/v1";
import * as tinker from "./index.ts";
import * as resource from "./resource/index.ts";
import * as signals from "./signals/index.ts";
import * as view from "./view/index.ts";

test("the package exports exactly the public APIs of its modules", () => {
  // The functional values core re-exports: the v1 constructors and classes it names.
  const reexported = {
    Emitter: functional.Emitter,
    Left: functional.Left,
    None: functional.None,
    Right: functional.Right,
    Some: functional.Some,
  };
  const modules = [signals, di, view, resource, reexported];
  const expected = modules.flatMap((module) => Object.keys(module))
    .sort();
  expect(Object.keys(tinker)
    .sort())
    .toEqual(expected);
  for (const module of modules) {
    for (const [name, value] of Object.entries(module)) {
      expect(tinker[name as keyof typeof tinker])
        .toBe(value);
    }
  }
});
