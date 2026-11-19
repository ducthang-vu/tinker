import { describe, expect, test, vi } from "vitest";
import { Task } from "@tinker/functional";
import { signal } from "../signals/index.ts";
import { tick } from "../view/internal/test-support.ts";
import { resource } from "./resource.ts";

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

describe("resource states", () => {
  test("starts loading, and a success fetches the value", async () => {
    const load = deferred<string>();
    const res = resource(() => load.promise, { default: "none" });
    expect(res.state())
      .toBe("loading");
    expect(res.value())
      .toBe("none");
    expect(res.sourced())
      .toBe(false);
    load.ok("Ada");
    await tick();
    expect(res.state())
      .toBe("fetched");
    expect(res.value())
      .toBe("Ada");
    expect(res.sourced())
      .toBe(true);
    expect(res.lastUpdated())
      .toBeInstanceOf(Date);
  });

  test("a failure sets the error and keeps the last success", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads = [first, second];
    const version = signal(0);
    const res = resource(() => {
      version();
      return loads.shift()!.promise;
    }, { default: "none" });
    first.ok("Ada");
    await tick();
    version.set(1);
    second.fail(new Error("offline"));
    await tick();
    expect(res.state())
      .toBe("failed");
    expect(res.error()?.message)
      .toBe("offline");
    expect(res.value())
      .toBe("Ada");
  });

  test("a failure before any success keeps the default, and sourced stays false", async () => {
    const load = deferred<string>();
    const res = resource(() => load.promise, { default: "none" });
    load.fail("not an Error");
    await tick();
    expect(res.state())
      .toBe("failed");
    expect(res.error()?.message)
      .toBe("not an Error");
    expect(res.value())
      .toBe("none");
    expect(res.sourced())
      .toBe(false);
    expect(res.lastUpdated())
      .toBeUndefined();
  });

  test("a success clears the error", async () => {
    const loads = [deferred<string>(), deferred<string>()];
    const res = resource(() => loads.shift()!.promise, { default: "none" });
    loads[0] = loads[0] ?? deferred<string>();
    const failing = deferred<string>();
    const after = deferred<string>();
    const queue = [failing, after];
    const again = resource(() => queue.shift()!.promise, { default: "none" });
    failing.fail(new Error("first"));
    await tick();
    expect(again.error()?.message)
      .toBe("first");
    again.reload();
    after.ok("second");
    await tick();
    expect(again.error())
      .toBeUndefined();
    expect(again.value())
      .toBe("second");
    expect(res.state())
      .toBe("loading");
  });
});

describe("resource loaders", () => {
  test("a Task loader's success and failure are the same as a promise's", async () => {
    const ok = resource(() => Task.succeed("Ada"), { default: "none" });
    expect(ok.value())
      .toBe("Ada");
    const failed = resource(() => Task.fail(new Error("gone")), { default: "none" });
    expect(failed.state())
      .toBe("failed");
    expect(failed.error()?.message)
      .toBe("gone");
  });

  test("a loader that throws is a failure, not an exception", () => {
    const res = resource(() => {
      throw new Error("bad");
    }, { default: 0 });
    expect(res.state())
      .toBe("failed");
    expect(res.error()?.message)
      .toBe("bad");
  });
});

describe("resource reactivity", () => {
  test("a signal the loader reads runs it again, and aborts the run before", async () => {
    const id = signal(1);
    const signals: AbortSignal[] = [];
    const loads = [deferred<string>(), deferred<string>()];
    const res = resource((abort) => {
      id();
      signals.push(abort);
      return loads[signals.length - 1]!.promise;
    }, { default: "none" });
    id.set(2);
    expect(signals[0]!.aborted)
      .toBe(true);
    expect(signals[1]!.aborted)
      .toBe(false);
    loads[1]!.ok("second");
    await tick();
    loads[0]!.ok("first");
    await tick();
    expect(res.value())
      .toBe("second");
  });

  test("a Task that is superseded is cancelled", () => {
    const id = signal(1);
    const cancel = vi.fn();
    resource(() => {
      const current = id();
      return Task.from<string, Error>(() => cancel);
    }, { default: "none" });
    id.set(2);
    expect(cancel)
      .toHaveBeenCalledTimes(1);
  });
});

describe("resource set and reload", () => {
  test("set writes the value, is sourced, and aborts the run in progress", async () => {
    const load = deferred<string>();
    const res = resource(() => load.promise, { default: "none" });
    res.set("Grace");
    expect(res.state())
      .toBe("written");
    expect(res.value())
      .toBe("Grace");
    expect(res.sourced())
      .toBe(true);
    load.ok("Ada");
    await tick();
    expect(res.value())
      .toBe("Grace");
  });

  test("set clears the error", async () => {
    const load = deferred<string>();
    const res = resource(() => load.promise, { default: "none" });
    load.fail(new Error("down"));
    await tick();
    res.set("Ada");
    expect(res.error())
      .toBeUndefined();
  });

  test("a lazy resource is idle until it is reloaded", async () => {
    const calls = vi.fn(() => Task.succeed("Ada"));
    const res = resource(calls, { default: "none", lazy: true });
    expect(res.state())
      .toBe("idle");
    expect(calls)
      .not.toHaveBeenCalled();
    res.reload();
    expect(calls)
      .toHaveBeenCalledTimes(1);
    expect(res.value())
      .toBe("Ada");
  });

  test("reload runs the loader again, and keeps the value while it does", async () => {
    const loads = [Task.succeed("first"), Task.succeed("second")];
    const calls = vi.fn(() => loads.shift()!);
    const res = resource(calls, { default: "none" });
    expect(res.value())
      .toBe("first");
    res.reload();
    expect(calls)
      .toHaveBeenCalledTimes(2);
    expect(res.value())
      .toBe("second");
  });
});
