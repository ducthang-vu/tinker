// The API's types, checked at compile time. The functions below are never called:
// they only have to typecheck, and `expectTypeOf` does nothing at run time.

import { describe, expect, expectTypeOf, test } from "vitest";
import { input, output } from "@tinker/core";
import type { ElementFixture, Fixture, TestBed, TestBedRef } from "./api.ts";
import { ComponentBuilder } from "./testbed.ts";

class Button {
  readonly pressed = output<number>();
  readonly label = input("");

  press(times: number): string {
    return String(times);
  }
}

class Other {}

function queries(ref: TestBedRef<Button>): void {
  expectTypeOf(ref.root.query("p"))
    .toEqualTypeOf<ElementFixture | null>();
  expectTypeOf(ref.root.query(Button))
    .toEqualTypeOf<Fixture<Button> | null>();
  expectTypeOf(ref.root.queryAll(Button))
    .toEqualTypeOf<Fixture<Button>[]>();
  expectTypeOf(ref.root.inputs.label)
    .toEqualTypeOf<string>();
}

function overrides(bed: TestBed<Button>): void {
  const mock = ComponentBuilder.mock(Button)
    .spy("press")
    .build();
  expectTypeOf(new mock().press.calls)
    .toEqualTypeOf<readonly [number][]>();
  bed.override(Button, mock);
  // @ts-expect-error only a mock of the class it replaces is accepted
  bed.override(Button, Other);
}

describe("the testing API types", () => {
  test("typecheck", () => {
    expect(queries)
      .toBeTypeOf("function");
    expect(overrides)
      .toBeTypeOf("function");
  });
});
