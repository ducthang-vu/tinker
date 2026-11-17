import { describe, expect, test } from "vitest";
import type { Injector } from "../../../di/index.ts";
import { DomRenderer } from "../renderer.ts";
import type { CompiledMap } from "../template/compile.ts";
import { ExpressionParser } from "../template/expression.ts";
import { Scope } from "../template/scope.ts";
import { MapBinding } from "./map-binding.ts";
import type { View } from "./view.ts";

describe("MapBinding", () => {
  test("a map whose anchor is not in the DOM cannot place its rows", () => {
    const node: CompiledMap = {
      kind: "map",
      list: ExpressionParser.parse("items")
        .getOrThrow(),
      item: { kind: "bind", name: "item" },
      body: [],
    };
    const renderer = new DomRenderer(document);
    const anchor = document.createComment("");
    const binding = new MapBinding(
      node,
      new Scope({ items: ["a"] }),
      new Map(),
      anchor,
      renderer,
      () => {
        throw new Error("a row is not rendered before its place exists");
      },
    );
    binding.attach({ addDestroyCallback: () => {} } as unknown as View, {} as Injector);
    expect(() => binding.update())
      .toThrow("The anchor of @map is not in the DOM");
  });
});
