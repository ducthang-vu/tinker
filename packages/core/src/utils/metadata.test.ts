import { describe, expect, test } from "vitest";
import { defineMetadata, ownMetadata } from "./metadata.ts";
import { isNone, getOrElse } from "@tinker/functional";

const KEY = Symbol("test metadata");

describe("class metadata", () => {
  test("stores and reads a value on the class", () => {
    class Target {}
    const value = { a: 1 };
    defineMetadata(Target, KEY, value);
    expect(getOrElse(ownMetadata(Target, KEY), undefined))
      .toBe(value);
  });

  test("is hidden and read-only", () => {
    class Target {}
    defineMetadata(Target, KEY, {});
    expect(Object.keys(Target))
      .toEqual([]);
    expect(() => {
      (Target as unknown as Record<symbol, unknown>)[KEY] = {};
    })
      .toThrow(TypeError);
  });

  test("is not inherited", () => {
    class Base {}
    defineMetadata(Base, KEY, {});
    class Child extends Base {}
    expect(isNone(ownMetadata(Child, KEY)))
      .toBe(true);
  });

  test("other keys and undecorated classes have none", () => {
    class Target {}
    defineMetadata(Target, KEY, {});
    expect(isNone(ownMetadata(Target, Symbol("other"))))
      .toBe(true);
    expect(isNone(ownMetadata(class {}, KEY)))
      .toBe(true);
  });
});
