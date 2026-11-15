import { describe, expect, test } from "vitest";
import type { Emitter } from "../../functional/index.ts";
import { endOutputs, output, outputsNamed, outputsOf } from "./output.ts";

/** What an output's subscribers hear, as plain data. */
function listen(emitter: Emitter<unknown, void, never>, log: unknown[]) {
  return emitter.stream.subscribe({
    next: (item) => item.match({ left: () => {}, right: (value) => log.push(value) }),
    end: () => log.push("end"),
  });
}

describe("output", () => {
  test("emit reaches the subscribers, in order; a value emitted before anyone listens is lost", () => {
    class Picker {
      readonly selected = output<number>();
    }
    const picker = new Picker();
    picker.selected.emit(0);
    const [emitter] = [...outputsOf(picker)
      .values()];
    const log: unknown[] = [];
    listen(emitter!, log);
    picker.selected.emit(1);
    picker.selected.emit(2);
    expect(log)
      .toEqual([1, 2]);
  });

  test("endOutputs completes every output of the instance: its subscribers are told it is over", () => {
    class Picker {
      readonly selected = output<number>();
      readonly other = output<string>();
    }
    const picker = new Picker();
    const log: unknown[] = [];
    for (const emitter of outputsOf(picker)
      .values()) {
      listen(emitter, log);
    }
    endOutputs(picker);
    picker.selected.emit(9);
    expect(log)
      .toEqual(["end", "end"]);
  });

  test("outputsNamed finds outputs by name, case-insensitively, across instances", () => {
    class A {
      readonly pickItem = output<number>();
    }
    class B {
      readonly pickitem = output<number>();
      readonly other = output<number>();
    }
    class C {}
    expect(outputsNamed([new A(), new B(), new C()], "PICKITEM"))
      .toHaveLength(2);
    expect(outputsNamed([new C()], "pickItem"))
      .toEqual([]);
  });

  test("outputsOf ignores properties that are not outputs", () => {
    class Plain {
      readonly count = 1;
      readonly nothing = null;
    }
    expect(outputsOf(new Plain()).size)
      .toBe(0);
  });
});
