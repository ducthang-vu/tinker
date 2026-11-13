import { describe, expect, test } from "vitest";
import { computed, signal, watch } from "../../signals/index.ts";
import { InputNotBoundError, input, inputsOf } from "./input.ts";

const syncScheduler = { schedule: (task: { run(): void }) => task.run() };

describe("input", () => {
  test("throws when read before it is bound, with a generic message", () => {
    const text = input<string>();
    expect(() => text())
      .toThrow(InputNotBoundError);
    expect(() => text())
      .toThrow("An input was read before it was bound (e.g. in the constructor)");
  });

  test("names the input in the error once the framework knows it", () => {
    class Tooltip {
      readonly text = input<string>();
    }
    const tooltip = new Tooltip();
    inputsOf(tooltip);
    expect(() => tooltip.text())
      .toThrow(`Input "text" of Tooltip was read before it was bound`);
  });

  test("reads the bound value, and updates like any signal", () => {
    class Tooltip {
      readonly text = input<string>();
      readonly shout = computed(() => this.text()
        .toUpperCase());
    }
    const tooltip = new Tooltip();
    const binding = inputsOf(tooltip)
      .get("text")!;
    const seen: string[] = [];
    watch(() => {
      try {
        seen.push(tooltip.shout());
      } catch (error) {
        seen.push((error as Error).name);
      }
    }, syncScheduler);

    binding.bind("hi");
    binding.bind("bye");
    binding.bind("bye");

    expect(seen)
      .toEqual(["InputNotBoundError", "HI", "BYE"]);
  });

  test("an optional input holds its default until it is bound", () => {
    class Tooltip {
      readonly position = input("top");
    }
    const tooltip = new Tooltip();
    expect(tooltip.position())
      .toBe("top");
    inputsOf(tooltip)
      .get("position")!.bind("bottom");
    expect(tooltip.position())
      .toBe("bottom");
  });

  test("undefined is a valid default, not the same as no default", () => {
    const hint = input<string | undefined>(undefined);
    expect(hint())
      .toBeUndefined();
  });

  test("the default's type is the input's type", () => {
    const position = input("top");
    const value: string = position();
    expect(value)
      .toBe("top");
  });

  test("is read-only for the directive", () => {
    const text = input<string>();
    expect("set" in text)
      .toBe(false);
  });
});

describe("inputsOf", () => {
  test("finds the own properties holding inputs, by name, and nothing else", () => {
    const shared = signal(1);
    class Card {
      readonly title = input<string>();
      readonly size = input<number>();
      readonly plain = shared;
      readonly label = "x";
      readonly nothing = null;
      method(): void {}
    }
    const inputs = inputsOf(new Card());
    expect([...inputs.keys()])
      .toEqual(["title", "size"]);
  });

  test("each instance has its own inputs", () => {
    class Card {
      readonly title = input<string>();
    }
    const a = new Card();
    const b = new Card();
    inputsOf(a)
      .get("title")!.bind("a");
    inputsOf(b)
      .get("title")!.bind("b");
    expect([a.title(), b.title()])
      .toEqual(["a", "b"]);
  });
});
