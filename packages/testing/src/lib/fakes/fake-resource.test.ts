import { describe, expect, test } from "vitest";
import { signal } from "@tinker/core";
import { fakeResource } from "./fake-resource.ts";

/** A fake whose loader reads `input`, so a test starts a new load by setting it. */
function withInput<T>(options: { readonly default: T; readonly autoLoad: boolean }) {
  const input = signal(0);
  return { input, user: fakeResource<T>({ ...options, inputs: input }) };
}

describe("fakeResource", () => {
  test("starts with the default, loading when autoLoad, and idle otherwise", () => {
    expect(withInput({ default: "none", autoLoad: true }).user.state())
      .toBe("loading");
    const idle = withInput({ default: "none", autoLoad: false }).user;
    expect(idle.value())
      .toBe("none");
    expect(idle.state())
      .toBe("idle");
  });

  test("resolve holds a value as fetched, and the value is sourced", () => {
    const { user } = withInput({ default: "none", autoLoad: true });
    user.resolve("Ada");
    expect(user.value())
      .toBe("Ada");
    expect(user.state())
      .toBe("fetched");
    expect(user.sourced())
      .toBe(true);
    expect(user.lastUpdated())
      .toBeInstanceOf(Date);
  });

  test("fail holds the error as failed, and the value keeps the last success", () => {
    const { user, input } = withInput({ default: "none", autoLoad: true });
    user.resolve("Ada");
    input.set(1);
    const failure = new Error("offline");
    user.fail(failure);
    expect(user.error())
      .toBe(failure);
    expect(user.state())
      .toBe("failed");
    expect(user.value())
      .toBe("Ada");
  });

  test("a success or a write clears the error", () => {
    const { user, input } = withInput({ default: "none", autoLoad: true });
    user.fail(new Error("offline"));
    input.set(1);
    user.resolve("Ada");
    expect(user.error())
      .toBeUndefined();
    input.set(2);
    user.fail(new Error("again"));
    user.set("Grace");
    expect(user.value())
      .toBe("Grace");
    expect(user.state())
      .toBe("written");
    expect(user.error())
      .toBeUndefined();
  });

  test("a value and the signals that describe it change together; a failure changes only the error", () => {
    const { user, input } = withInput({ default: "none", autoLoad: true });
    user.resolve("Ada");
    const updated = user.lastUpdated();
    input.set(1);
    user.fail(new Error("offline"));
    expect(user.value())
      .toBe("Ada");
    expect(user.sourced())
      .toBe(true);
    expect(user.lastUpdated())
      .toBe(updated);
    user.set("Grace");
    expect([user.value(), user.sourced(), user.state(), user.error()])
      .toEqual(["Grace", true, "written", undefined]);
    expect(user.lastUpdated())
      .toBeInstanceOf(Date);
  });

  test("reload loads again and counts, from idle or from a value", () => {
    const { user } = withInput({ default: "none", autoLoad: false });
    user.reload();
    expect(user.state())
      .toBe("loading");
    expect(user.reloads)
      .toBe(1);
    user.resolve("Ada");
    user.reload();
    expect(user.state())
      .toBe("loading");
    expect(user.value())
      .toBe("Ada");
    expect(user.reloads)
      .toBe(2);
  });

  test("a change to the inputs starts a new load: loading, value kept, and not counted as a reload", () => {
    const { user, input } = withInput({ default: "none", autoLoad: true });
    user.resolve("Ada");
    input.set(1);
    expect(user.state())
      .toBe("loading");
    expect(user.value())
      .toBe("Ada");
    expect(user.reloads)
      .toBe(0);
  });

  test("trigger starts a new load and keeps the value, and is not counted as a reload", () => {
    const { user } = withInput({ default: "none", autoLoad: false });
    user.reload();
    user.resolve("Ada");
    user.trigger();
    expect(user.state())
      .toBe("loading");
    expect(user.value())
      .toBe("Ada");
    // Only the reload() above counts: the trigger does not.
    expect(user.reloads)
      .toBe(1);
  });

  test("triggerAndResolve ends fetched with the value", () => {
    const { user } = withInput({ default: "none", autoLoad: false });
    user.triggerAndResolve("Grace");
    expect(user.value())
      .toBe("Grace");
    expect(user.state())
      .toBe("fetched");
    expect(user.sourced())
      .toBe(true);
  });

  test("resolve and fail throw unless a load is in progress", () => {
    const { user } = withInput({ default: "none", autoLoad: false });
    expect(() => user.resolve("Ada"))
      .toThrow("the fake has no load in progress, its state is \"idle\"");
    expect(() => user.fail(new Error("offline")))
      .toThrow("the fake has no load in progress, its state is \"idle\"");
    user.reload();
    user.resolve("Ada");
    expect(() => user.resolve("Grace"))
      .toThrow("the fake has no load in progress, its state is \"fetched\"");
    expect(user.value())
      .toBe("Ada");
  });

  test("autoResolve gives the initial response: the fake starts fetched with it", () => {
    const input = signal(0);
    const user = fakeResource({ default: "none", autoLoad: true, autoResolve: "Ada", inputs: input });
    expect(user.value())
      .toBe("Ada");
    expect(user.state())
      .toBe("fetched");
    expect(user.sourced())
      .toBe(true);
    input.set(1);
    expect(user.value())
      .toBe("Ada");
    expect(user.state())
      .toBe("loading");
  });

  test("autoResolve needs autoLoad", () => {
    // @ts-expect-error autoResolve is only accepted with autoLoad: true
    fakeResource({ default: "none", autoLoad: false, autoResolve: "Ada" });
  });
});
