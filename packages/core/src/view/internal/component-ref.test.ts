import { describe, expect, test } from "vitest";
import { Component, input, output } from "../index.ts";
import { Engine } from "./engine.ts";
import { type Either, valueOrThrow } from "@tinker/functional/v1";
import { messageOf } from "./test-support.ts";

@Component({ selector: "tk-label", template: "<p>{{ label() }}</p>" })
class Label {
  readonly label = input("");
  readonly picked = output<number>();

  pick(value: number): void {
    this.picked.emit(value);
  }
}

describe("ComponentRef", () => {
  test("gives the instance and the host the component was rendered into", () => {
    const host = document.createElement("section");
    const ref = valueOrThrow(Engine.create()
      .createComponent(Label, host));
    expect(ref.instance)
      .toBeInstanceOf(Label);
    expect(ref.host.nativeElement)
      .toBe(host);
  });

  test("setInput sets a public input; the DOM follows at the next flush", () => {
    const engine = Engine.create();
    const ref = valueOrThrow(engine.createComponent(Label));
    ref.setInput("label", "first");
    engine.flush();
    expect(ref.host.nativeElement.textContent)
      .toBe("first");
    ref.setInput("label", "second");
    engine.flush();
    expect(ref.host.nativeElement.textContent)
      .toBe("second");
  });

  test("subscribe hears the public output's values until it is cancelled", () => {
    const engine = Engine.create();
    const ref = valueOrThrow(engine.createComponent(Label));
    const seen: number[] = [];
    const cancel = valueOrThrow(ref.subscribe("picked", (value) => seen.push(value)));
    ref.instance.pick(1);
    cancel();
    ref.instance.pick(2);
    expect(seen)
      .toEqual([1]);
  });

  test("emit sends a value through a public output, as if the component emitted it", () => {
    const engine = Engine.create();
    const ref = valueOrThrow(engine.createComponent(Label));
    const seen: number[] = [];
    ref.subscribe("picked", (value) => seen.push(value));
    ref.emit("picked", 7);
    expect(seen)
      .toEqual([7]);
  });

  test("emit or subscribe to a name that is not an output is an error", () => {
    const untyped = valueOrThrow(Engine.create()
      .createComponent(Label)) as unknown as {
      emit(name: string, value: unknown): Either<void, Error>;
      subscribe(name: string, handler: () => void): Either<() => void, Error>;
    };
    expect(messageOf(untyped.emit("label", 1)))
      .toBe("Label has no output \"label\"");
    expect(messageOf(untyped.subscribe("missing", () => {})))
      .toBe("Label has no output \"missing\"");
  });

  test("destroy removes the component from its host, and is harmless when repeated", () => {
    const host = document.createElement("section");
    const ref = valueOrThrow(Engine.create()
      .createComponent(Label, host));
    ref.setInput("label", "x");
    ref.destroy();
    expect(host.innerHTML)
      .toBe("");
    expect(() => ref.destroy())
      .not.toThrow();
  });
});
