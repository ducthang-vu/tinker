import { describe, expect, test } from "vitest";
import { tick } from "./test-support.ts";

describe("tick", () => {
  test("resolves after the pending microtasks have run", async () => {
    const order: string[] = [];
    queueMicrotask(() => order.push("microtask"));
    await tick();
    order.push("after tick");
    expect(order)
      .toEqual(["microtask", "after tick"]);
  });
});
