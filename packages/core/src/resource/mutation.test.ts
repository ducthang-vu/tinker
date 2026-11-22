import { describe, expect, test, vi } from "vitest";
import { tick } from "../view/internal/test-support.ts";
import { resource } from "./resource.ts";
import { mutation } from "./mutation.ts";
import { succeed, fail, run } from "@tinker/functional/v1";

/** A promise the test settles by hand. */
function deferred<T>() {
  let ok!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    ok = resolve;
    fail = reject;
  });
  return { promise, ok, fail };
}

describe("mutation", () => {
  test("starts with no outcome and nothing pending", () => {
    const save = mutation(() => succeed("saved"));
    expect(save.pending())
      .toBe(0);
    expect(save.outcome())
      .toBe("none");
    expect(save.result())
      .toBeUndefined();
  });

  test("a call is pending until it succeeds, then gives its result", async () => {
    const call = deferred<string>();
    const save = mutation(() => call.promise);
    save.mutate(undefined);
    expect(save.pending())
      .toBe(1);
    call.ok("saved");
    await tick();
    expect(save.pending())
      .toBe(0);
    expect(save.outcome())
      .toBe("succeeded");
    expect(save.result())
      .toBe("saved");
  });

  test("a failure gives its error, and keeps the last result", async () => {
    const save = mutation<number, string, Error>((input) => (input > 0 ? succeed("ok") : fail(new Error("bad"))));
    save.mutate(1);
    save.mutate(0);
    expect(save.outcome())
      .toBe("failed");
    expect(save.error()?.message)
      .toBe("bad");
    expect(save.result())
      .toBe("ok");
  });

  test("a synchronous throw is a failure, not an exception", () => {
    const save = mutation(() => {
      throw new Error("boom");
    });
    save.mutate(undefined);
    expect(save.outcome())
      .toBe("failed");
    expect(save.error()?.message)
      .toBe("boom");
  });

  test("a promise that rejects with a non-error is wrapped as an error", async () => {
    const call = deferred<string>();
    const save = mutation(() => call.promise);
    save.mutate(undefined);
    call.fail("network down");
    await tick();
    expect(save.outcome())
      .toBe("failed");
    expect(save.error()?.message)
      .toBe("network down");
  });

  test("calls run in parallel, and the outcome is the last one to finish", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const calls = [first, second];
    const save = mutation(() => calls.shift()!.promise);
    save.mutate(undefined);
    save.mutate(undefined);
    expect(save.pending())
      .toBe(2);
    second.ok("second");
    await tick();
    expect(save.outcome())
      .toBe("succeeded");
    expect(save.result())
      .toBe("second");
    expect(save.pending())
      .toBe(1);
    first.fail(new Error("first failed"));
    await tick();
    expect(save.outcome())
      .toBe("failed");
    expect(save.pending())
      .toBe(0);
  });

  test("a call is not cancelled by another, and reset clears the outcome", async () => {
    const call = deferred<string>();
    const save = mutation(() => call.promise);
    save.mutate(undefined);
    save.mutate(undefined);
    save.reset();
    expect(save.outcome())
      .toBe("none");
    expect(save.pending())
      .toBe(2);
  });
});

describe("mutation and its resource", () => {
  test("a success with no onSuccess reloads the resource", async () => {
    const loader = vi.fn(() => succeed("list"));
    const list = resource(loader, { default: "empty", lazy: true });
    const save = mutation(() => succeed("saved"), { resource: list });
    save.mutate(undefined);
    await tick();
    expect(loader)
      .toHaveBeenCalledTimes(1);
  });

  test("a success with onSuccess updates the resource from the response", async () => {
    const list = resource(() => succeed<string[]>(["a"]), { default: [] as string[], lazy: true });
    list.reload();
    const save = mutation(() => succeed("b"), {
      resource: list,
      onSuccess: (current, created) => [...current, created],
    });
    save.mutate(undefined);
    await tick();
    expect(list.value())
      .toEqual(["a", "b"]);
    expect(list.state())
      .toBe("written");
  });

  test("a failure leaves the resource alone", async () => {
    const loader = vi.fn(() => succeed("list"));
    const list = resource(loader, { default: "empty", lazy: true });
    const save = mutation(() => fail(new Error("no")), { resource: list });
    save.mutate(undefined);
    await tick();
    expect(loader)
      .not.toHaveBeenCalled();
  });
});
