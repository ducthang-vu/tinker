import { describe, expect, test } from "vitest";
import { InjectionToken, type Token } from "./inject.ts";
import {
  CircularDependencyError,
  type CreationHooks,
  type CreationStep,
  type Provider,
  ProviderRecords,
} from "./provider-records.ts";

const A = new InjectionToken<string>("A");
const B = new InjectionToken<number>("B");
const C = new InjectionToken<string>("C");

/** Hooks that just call the factory, and record what happens. */
function fakeHooks() {
  const log: string[] = [];
  const hooks: CreationHooks = {
    create: (factory) => {
      log.push("create");
      return factory();
    },
    created: (value) => log.push(`created ${String(value)}`),
  };
  return { hooks, log };
}

describe("ProviderRecords", () => {
  test("has: whether there is a provider for a token", () => {
    const records = new ProviderRecords([{ token: A, factory: () => "a" }], fakeHooks().hooks);
    expect(records.has(A)).toBe(true);
    expect(records.has(B)).toBe(false);
  });

  test("get creates the value through the hooks", () => {
    const { hooks, log } = fakeHooks();
    const records = new ProviderRecords([{ token: A, factory: () => "a" }], hooks);
    expect(records.get(A)).toBe("a");
    expect(log).toEqual(["create", "created a"]);
  });

  test("get creates each value once, then returns the cached one", () => {
    const { hooks, log } = fakeHooks();
    let calls = 0;
    const records = new ProviderRecords([{ token: A, factory: () => `a${++calls}` }], hooks);
    expect(records.get(A)).toBe("a1");
    expect(records.get(A)).toBe("a1");
    expect(calls).toBe(1);
    expect(log).toEqual(["create", "created a1"]);
  });

  test("caches falsy values too", () => {
    let calls = 0;
    const ZERO = new InjectionToken<number>("ZERO");
    const records = new ProviderRecords([{ token: ZERO, factory: () => (calls++, 0) }], fakeHooks().hooks);
    expect(records.get(ZERO)).toBe(0);
    expect(records.get(ZERO)).toBe(0);
    expect(calls).toBe(1);
  });

  test("if creating throws, nothing is cached and the next get tries again", () => {
    let fail = true;
    const { hooks, log } = fakeHooks();
    const records = new ProviderRecords(
      [
        {
          token: A,
          factory: () => {
            if (fail) throw new Error("not yet");
            return "a";
          },
        },
      ],
      hooks,
    );
    expect(() => records.get(A)).toThrow("not yet");
    fail = false;
    expect(records.get(A)).toBe("a");
    expect(log).toEqual(["create", "create", "created a"]);
  });

  test("throws for a token without a provider", () => {
    const records = new ProviderRecords([], fakeHooks().hooks);
    expect(() => records.get(A)).toThrow("No provider for A");
  });

  test("matches tokens by identity, not by name", () => {
    const records = new ProviderRecords([{ token: A, factory: () => "a" }], fakeHooks().hooks);
    const sameName = new InjectionToken<string>("A");
    expect(records.has(sameName)).toBe(false);
  });

  test("the first provider for a token wins", () => {
    const records = new ProviderRecords(
      [
        { token: A, factory: () => "first" },
        { token: A, factory: () => "second" },
      ],
      fakeHooks().hooks,
    );
    expect(records.get(A)).toBe("first");
  });

  test("copies the providers: changing the array later has no effect", () => {
    const providers: Provider<unknown>[] = [{ token: A, factory: () => "a" }];
    const records = new ProviderRecords(providers, fakeHooks().hooks);
    providers.push({ token: B, factory: () => 1 });
    providers.length = 0;
    expect(records.has(A)).toBe(true);
    expect(records.has(B)).toBe(false);
  });
});

describe("ProviderRecords cycles", () => {
  test("a value that needs itself throws CircularDependencyError", () => {
    const records: ProviderRecords = new ProviderRecords(
      [{ token: A, factory: () => records.get(A) }],
      fakeHooks().hooks,
    );
    expect(() => records.get(A)).toThrow(CircularDependencyError);
    expect(() => records.get(A)).toThrow("Circular dependency: A → A");
  });

  test("the error describes the whole cycle, as message and as path", () => {
    const records: ProviderRecords = new ProviderRecords(
      [
        { token: A, factory: () => `a(${records.get(B)})` },
        { token: B, factory: () => records.get(C).length },
        { token: C, factory: () => records.get(A) },
      ],
      fakeHooks().hooks,
    );
    let error: unknown;
    try {
      records.get(A);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CircularDependencyError);
    expect((error as CircularDependencyError).message).toBe("Circular dependency: A → B → C → A");
    expect((error as CircularDependencyError).path).toEqual([A, B, C, A]);
  });

  test("the path starts at the repeated token, not at the outermost creation", () => {
    const records: ProviderRecords = new ProviderRecords(
      [
        { token: C, factory: () => records.get(A) },
        { token: A, factory: () => `a(${records.get(B)})` },
        { token: B, factory: () => records.get(A).length },
      ],
      fakeHooks().hooks,
    );
    expect(() => records.get(C)).toThrow("Circular dependency: A → B → A");
  });

  test("after a cycle, nothing is stuck: records can be created once the cause is gone", () => {
    let loop = true;
    const { hooks, log } = fakeHooks();
    const records: ProviderRecords = new ProviderRecords(
      [{ token: A, factory: () => (loop ? records.get(A) : "a") }],
      hooks,
    );
    expect(() => records.get(A)).toThrow(CircularDependencyError);
    loop = false;
    expect(records.get(A)).toBe("a");
    expect(log.filter((entry) => entry.startsWith("created"))).toEqual(["created a"]);
  });

  test("the same token in two different records is not a cycle", () => {
    const parent = new ProviderRecords([{ token: A, factory: () => "parent" }], fakeHooks().hooks);
    const child = new ProviderRecords(
      [{ token: A, factory: () => `child wraps ${parent.get(A)}` }],
      fakeHooks().hooks,
    );
    expect(child.get(A)).toBe("child wraps parent");
  });

  test("has is not affected while a value is being created", () => {
    let seen: boolean | undefined;
    const records: ProviderRecords = new ProviderRecords(
      [{ token: A, factory: () => ((seen = records.has(A)), "a") }],
      fakeHooks().hooks,
    );
    records.get(A);
    expect(seen).toBe(true);
  });
});


describe("CircularDependencyError", () => {
  test("names the cycle in its message and keeps the path", () => {
    const error = new CircularDependencyError([A, B, A]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CircularDependencyError");
    expect(error.message).toBe("Circular dependency: A → B → A");
    expect(error.path).toEqual([A, B, A]);
  });

  test("fromCreationPath starts the path where the repeated creation began", () => {
    const owner = {};
    const steps: CreationStep[] = [
      { owner, token: C },
      { owner, token: A },
      { owner, token: B },
    ];
    expect(CircularDependencyError.fromCreationPath(steps, owner, A).path).toEqual([A, B, A]);
  });

  test("fromCreationPath matches the owner as well as the token", () => {
    const parent = {};
    const child = {};
    const steps: CreationStep[] = [
      { owner: child, token: A }, // the child creating A (e.g. wrapping its parent's A)
      { owner: parent, token: A },
      { owner: parent, token: B },
    ];
    expect(CircularDependencyError.fromCreationPath(steps, parent, A).message).toBe(
      "Circular dependency: A → B → A",
    );
  });
});

describe("ProviderRecords.add", () => {
  test("adds a provider after creation", () => {
    const records = new ProviderRecords([], fakeHooks().hooks);
    records.add({ token: A, factory: () => "added" });
    expect(records.has(A)).toBe(true);
    expect(records.get(A)).toBe("added");
  });

  test("does nothing if the token already has a provider", () => {
    const records = new ProviderRecords([{ token: A, factory: () => "first" }], fakeHooks().hooks);
    records.add({ token: A, factory: () => "second" });
    expect(records.get(A)).toBe("first");
  });
});
