import { describe, expect, test } from "vitest";
import { defineMetadata, ownMetadata } from "./metadata.ts";

const KEY = Symbol("test metadata");

describe("class metadata", () => {
  test("stores and reads a value on the class", () => {
    class Target {}
    const value = { a: 1 };
    defineMetadata(Target, KEY, value);
    expect(ownMetadata(Target, KEY)).toBe(value);
  });

  test("is hidden and read-only", () => {
    class Target {}
    defineMetadata(Target, KEY, {});
    expect(Object.keys(Target)).toEqual([]);
    expect(() => {
      (Target as unknown as Record<symbol, unknown>)[KEY] = {};
    }).toThrow(TypeError);
  });

  test("is not inherited", () => {
    class Base {}
    defineMetadata(Base, KEY, {});
    class Child extends Base {}
    expect(ownMetadata(Child, KEY)).toBeUndefined();
  });

  test("other keys and undecorated classes have none", () => {
    class Target {}
    defineMetadata(Target, KEY, {});
    expect(ownMetadata(Target, Symbol("other"))).toBeUndefined();
    expect(ownMetadata(class {}, KEY)).toBeUndefined();
  });
});
