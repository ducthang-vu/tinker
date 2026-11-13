import { describe, expect, test } from "vitest";
import type { Consumer, Producer } from "../types.ts";
import { DependenciesContainer } from "./dependencies-container.ts";

/** A producer whose version can be bumped by hand, recording who unsubscribed. */
function fakeProducer(): Producer & { bump(): void; removed: Consumer[]; synced: number } {
  let version = 0;
  return {
    get version() {
      return version;
    },
    bump() {
      version++;
    },
    removed: [],
    synced: 0,
    removeConsumer(consumer) {
      this.removed.push(consumer);
    },
    sync() {
      this.synced++;
    },
  };
}

const consumer: Consumer = { allowWrites: false, addDependency() {}, markDirty() {} };

describe("DependenciesContainer", () => {
  test("changed() is false until a recorded dependency's version moves", () => {
    const deps = new DependenciesContainer();
    const p = fakeProducer();
    deps.start();
    deps.add(p);
    deps.finish(consumer);
    expect(deps.changed())
      .toBe(false);
    p.bump();
    expect(deps.changed())
      .toBe(true);
  });

  test("changed() syncs dependencies before comparing", () => {
    const deps = new DependenciesContainer();
    const p = fakeProducer();
    deps.start();
    deps.add(p);
    deps.finish(consumer);
    deps.changed();
    expect(p.synced)
      .toBe(1);
  });

  test("reading the same producer again records its latest version", () => {
    const deps = new DependenciesContainer();
    const p = fakeProducer();
    deps.start();
    deps.add(p);
    p.bump();
    deps.add(p);
    deps.finish(consumer);
    expect(deps.changed())
      .toBe(false);
  });

  test("finish() unsubscribes only from producers the new run did not read", () => {
    const deps = new DependenciesContainer();
    const kept = fakeProducer();
    const dropped = fakeProducer();
    deps.start();
    deps.add(kept);
    deps.add(dropped);
    deps.finish(consumer);

    deps.start();
    deps.add(kept);
    deps.finish(consumer);

    expect(dropped.removed)
      .toEqual([consumer]);
    expect(kept.removed)
      .toEqual([]);
  });

  test("clear() unsubscribes from everything and forgets it", () => {
    const deps = new DependenciesContainer();
    const p = fakeProducer();
    deps.start();
    deps.add(p);
    deps.finish(consumer);
    deps.clear(consumer);
    expect(p.removed)
      .toEqual([consumer]);
    p.bump();
    expect(deps.changed())
      .toBe(false);
  });
});
