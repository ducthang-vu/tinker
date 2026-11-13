import { describe, expect, test } from "vitest";
import { activeConsumer } from "../context/active-consumer.ts";
import type { Consumer, Producer } from "../types.ts";
import { ConsumersContainer } from "./consumers-container.ts";

/** A consumer that records what happens to it. */
function fakeConsumer(): Consumer & { dirty: number; deps: Producer[] } {
  return {
    allowWrites: true,
    dirty: 0,
    deps: [],
    addDependency(producer) {
      this.deps.push(producer);
    },
    markDirty() {
      this.dirty++;
    },
  };
}

const producer = {} as Producer;

describe("ConsumersContainer", () => {
  test("version starts at 0 and only bumpVersion changes it", () => {
    const consumers = new ConsumersContainer();
    expect(consumers.version)
      .toBe(0);
    consumers.bumpVersion();
    expect(consumers.version)
      .toBe(1);
  });

  test("markAllDirty marks every added consumer, but not removed ones", () => {
    const consumers = new ConsumersContainer();
    const a = fakeConsumer();
    const b = fakeConsumer();
    consumers.add(a);
    consumers.add(b);
    consumers.add(a); // a set: no duplicates
    consumers.remove(b);
    consumers.markAllDirty();
    expect(a.dirty)
      .toBe(1);
    expect(b.dirty)
      .toBe(0);
  });

  test("reportRead links the active consumer on both sides", () => {
    const consumers = new ConsumersContainer();
    const reader = fakeConsumer();
    activeConsumer.set(reader);
    try {
      consumers.reportRead(producer);
    } finally {
      activeConsumer.set(null);
    }
    expect(reader.deps)
      .toEqual([producer]);
    consumers.markAllDirty();
    expect(reader.dirty)
      .toBe(1);
  });

  test("reportRead with no active consumer links nothing", () => {
    const consumers = new ConsumersContainer();
    consumers.reportRead(producer);
    const later = fakeConsumer();
    consumers.markAllDirty();
    expect(later.dirty)
      .toBe(0);
  });

  test("markAllDirty is safe when consumers change the set while it runs", () => {
    const consumers = new ConsumersContainer();
    const late = fakeConsumer();
    const adder: Consumer = {
      allowWrites: true,
      addDependency() {},
      markDirty() {
        consumers.add(late);
      },
    };
    consumers.add(adder);
    consumers.markAllDirty();
    expect(late.dirty)
      .toBe(0); // added during the walk: not visited this time
  });
});
