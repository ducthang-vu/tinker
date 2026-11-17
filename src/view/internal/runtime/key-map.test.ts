import { describe, expect, test } from "vitest";
import { KeyMap } from "./key-map.ts";

describe("KeyMap", () => {
  test("a key of one part is found by ===", () => {
    const map = new KeyMap<string>();
    map.set([1], "one");
    expect(map.get([1]))
      .toBe("one");
    expect(map.get([2]))
      .toBeUndefined();
  });

  test("a key of several parts is found when each part is ===, whatever the objects' references", () => {
    const shared = { id: 1 };
    const map = new KeyMap<string>();
    map.set([shared, "a"], "first");
    expect(map.get([shared, "a"]))
      .toBe("first");
    expect(map.get([{ id: 1 }, "a"]))
      .toBeUndefined();
  });

  test("keys that share a prefix are different keys", () => {
    const map = new KeyMap<string>();
    map.set([1, 2], "long");
    map.set([1], "short");
    expect(map.get([1]))
      .toBe("short");
    expect(map.get([1, 2]))
      .toBe("long");
    expect(map.get([1, 3]))
      .toBeUndefined();
  });

  test("has tells a stored key from a missing one", () => {
    const map = new KeyMap<number>();
    map.set([1], 0);
    expect(map.has([1]))
      .toBe(true);
    expect(map.has([2]))
      .toBe(false);
    expect(map.has([1, 2]))
      .toBe(false);
  });

  test("delete removes a key but keeps the keys below it", () => {
    const map = new KeyMap<string>();
    map.set([1], "one");
    map.set([1, 2], "deeper");
    map.delete([1]);
    expect(map.has([1]))
      .toBe(false);
    expect(map.get([1, 2]))
      .toBe("deeper");
    map.delete([9]);
    map.delete([1, 2, 3]);
    expect(map.values())
      .toEqual(["deeper"]);
  });

  test("values lists every stored value", () => {
    const map = new KeyMap<string>();
    map.set([], "empty");
    map.set([1, 2], "b");
    map.set([1], "a");
    expect(map.values()
      .sort())
      .toEqual(["a", "b", "empty"]);
  });
});
