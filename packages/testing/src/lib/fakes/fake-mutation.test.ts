import { describe, expect, test } from "vitest";
import { resource } from "@tinker/core";
import { fakeMutation } from "./fake-mutation.ts";

describe("fakeMutation", () => {
  test("a call is in flight until the test settles it: pending counts it, and resolve gives the result", () => {
    const save = fakeMutation<string, string>();
    save.mutate("a");
    expect(save.pending())
      .toBe(1);
    expect(save.outcome())
      .toBe("none");
    save.resolve("saved a");
    expect(save.pending())
      .toBe(0);
    expect(save.result())
      .toBe("saved a");
    expect(save.outcome())
      .toBe("succeeded");
    expect(save.calls)
      .toEqual(["a"]);
  });

  test("fail gives the error, and the outcome is failed", () => {
    const save = fakeMutation<string, string>();
    save.mutate("a");
    const failure = new Error("offline");
    save.fail(failure);
    expect(save.error())
      .toBe(failure);
    expect(save.outcome())
      .toBe("failed");
    expect(save.pending())
      .toBe(0);
  });

  test("calls run in parallel, and each settle takes the oldest call in flight", () => {
    const save = fakeMutation<string, string>();
    save.mutate("a");
    save.mutate("b");
    expect(save.pending())
      .toBe(2);
    save.resolve("saved a");
    expect(save.pending())
      .toBe(1);
    expect(save.calls)
      .toEqual(["a", "b"]);
  });

  test("resolve and fail throw when no call is in flight", () => {
    const save = fakeMutation<string, string>();
    expect(() => save.resolve("x"))
      .toThrow("the fake has no call in flight: call mutate() first");
    expect(() => save.fail(new Error("x")))
      .toThrow("the fake has no call in flight: call mutate() first");
  });

  test("a success updates the resource it affects, through onSuccess", () => {
    const list = resource(() => undefined, { default: [1] });
    const save = fakeMutation<number, number, Error, number[]>({
      resource: list,
      onSuccess: (current, result) => [...current, result],
    });
    save.mutate(2);
    save.resolve(2);
    expect(list.value())
      .toEqual([1, 2]);
  });

  test("reset goes back to none, and keeps the calls in flight", () => {
    const save = fakeMutation<string, string>();
    save.mutate("a");
    save.resolve("saved a");
    save.mutate("b");
    save.reset();
    expect(save.outcome())
      .toBe("none");
    expect(save.result())
      .toBeUndefined();
    expect(save.pending())
      .toBe(1);
  });
});
