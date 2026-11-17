// A map binding: renders its body once per item of a list, in list order. The
// rows are matched to the new list by their identity (`track`, or the index),
// so a row keeps its view while its item stays. What the item's pattern binds
// (its name, or the names a destructuring pattern takes) are signals, so a row
// whose item changed updates without being recreated.
//
// Each row is an embedded view placed before its own comment anchor, and the
// anchors sit in order before the map's anchor. A row is created before it is
// put in its place, and the rows are moved only when their order changes.

import type { Injector } from "../../../di/index.ts";
import { computed, type ReadonlySignal, signal, type Signal } from "../../../signals/index.ts";
import type { Renderer } from "../renderer.ts";
import type { CompiledMap, CompiledNode } from "../template/compile.ts";
import { evaluate } from "../template/evaluate.ts";
import { Scope } from "../template/scope.ts";
import { match } from "./match-binding.ts";
import { KeyMap } from "./key-map.ts";
import type { EmbeddedView } from "./embedded-view.ts";
import type { Binding } from "./text-binding.ts";
import type { View } from "./view.ts";

/** Renders a row: its body, the scope its names are read from, its anchor, and the injector. */
export type RowRenderer = (
  body: readonly CompiledNode[],
  scope: Scope,
  anchor: Node,
  injector: Injector,
) => EmbeddedView;

/** One item of the list, as a row on the page. Its key is the parts of its identity. */
interface Row {
  readonly key: readonly unknown[];
  readonly anchor: Comment;
  readonly view: EmbeddedView;
  /** What the item's pattern binds, by name: a signal each, so the row follows the item. */
  readonly names: ReadonlyMap<string, Signal<unknown>>;
  readonly index: Signal<number>;
  readonly count: Signal<number>;
}

export class MapBinding implements Binding {
  private rows: Row[] = [];
  /** Set by `attach`, before the first update. */
  private injector!: Injector;

  /**
   * @param node The map: its list, what each item is matched with, its track and body.
   * @param scope The names the list is read from.
   * @param above The `@let`s declared above the map, which its rows see.
   * @param anchor The map's comment, after which the rows are placed.
   * @param renderer Creates the anchors and moves the rows.
   * @param render Renders a row.
   */
  constructor(
    private readonly node: CompiledMap,
    private readonly scope: Scope,
    private readonly above: ReadonlyMap<string, ReadonlySignal<unknown>>,
    private readonly anchor: Comment,
    private readonly renderer: Renderer,
    private readonly render: RowRenderer,
  ) {}

  /**
   * Set the injector the rows are created under, and remove the rows when
   * `view`, which owns the map, is destroyed.
   */
  attach(view: View, injector: Injector): void {
    this.injector = injector;
    view.addDestroyCallback(() => this.clear());
  }

  /** Evaluate the list, and bring the rows to match it. */
  update(): void {
    const list = evaluate(this.node.list, this.scope);
    if (!Array.isArray(list)) {
      throw new Error(`@map needs a list, got ${describe(list)}`);
    }
    const keys = list.map((value, index) => this.keyOf(value, index, list.length));
    const seen = new KeyMap<true>();
    for (const key of keys) {
      if (seen.has(key)) {
        throw new Error("The track of @map gives two items the same key");
      }
      seen.set(key, true);
    }
    const previous = new KeyMap<Row>();
    for (const row of this.rows) {
      previous.set(row.key, row);
    }
    const created: Row[] = [];
    const next = list.map((value, index) => {
      const existing = previous.get(keys[index]!);
      if (existing === undefined) {
        const row = this.create(keys[index]!, value, index, list.length);
        created.push(row);
        return row;
      }
      previous.delete(keys[index]!);
      for (const [name, bound] of this.bindingsOf(value)) {
        existing.names.get(name)!.set(bound);
      }
      existing.index.set(index);
      existing.count.set(list.length);
      return existing;
    });
    // What is left in `previous` has no item in the new list: its row goes.
    const stale = new Set(previous.values());
    for (const row of stale) {
      this.remove(row);
    }
    // The rows that stay, in their old order, against their new order: the
    // rows are moved only when those differ, or when a row was created.
    const survivors = this.rows.filter((row) => !stale.has(row));
    const fresh = new Set(created);
    const reused = next.filter((row) => !fresh.has(row));
    const moved = reused.some((row, index) => row !== survivors[index]);
    this.rows = next;
    if (created.length > 0 || moved) {
      this.placeRows();
    }
  }

  /** What the item's pattern binds, or an error if the item does not match it. */
  private bindingsOf(value: unknown): ReadonlyMap<string, unknown> {
    const bound = match(this.node.item, value);
    if (bound === undefined) {
      throw new Error("An item of @map does not match its let pattern");
    }
    return bound;
  }

  /**
   * The identity of the item at `index`, as the parts it is made of: its index
   * by default, the value of its `track` expression, or its `track { … }` fields.
   */
  private keyOf(value: unknown, index: number, count: number): readonly unknown[] {
    const track = this.node.track;
    if (track === undefined) {
      return [index];
    }
    if (track.kind === "fields") {
      return track.names.map((name) => fieldOf(value, name));
    }
    const names = new Map(
      [...this.bindingsOf(value)].map(([name, bound]) => [name, computed(() => bound)]),
    );
    const lets = this.namesOf(names, computed(() => index), computed(() => count));
    return [evaluate(track.expression, new Scope(this.scope.component, lets))];
  }

  /** The names a row reads: the `@let`s above the map, its item's names, and its `$` variables. */
  private namesOf(
    names: ReadonlyMap<string, ReadonlySignal<unknown>>,
    index: ReadonlySignal<number>,
    count: ReadonlySignal<number>,
  ): Map<string, ReadonlySignal<unknown>> {
    const lets = new Map(this.above);
    for (const [name, signal] of names) {
      lets.set(name, signal);
    }
    lets.set("$index", index);
    lets.set("$count", count);
    lets.set("$first", computed(() => index() === 0));
    lets.set("$last", computed(() => index() === count() - 1));
    lets.set("$even", computed(() => index() % 2 === 0));
    lets.set("$odd", computed(() => index() % 2 === 1));
    return lets;
  }

  /** A new row, rendered in the DOM before its place is settled. */
  private create(key: readonly unknown[], value: unknown, index: number, count: number): Row {
    const anchor = this.renderer.createComment("");
    this.renderer.insertBefore(this.parent(), anchor, this.anchor);
    const names = new Map(
      [...this.bindingsOf(value)].map(([name, bound]) => [name, signal(bound)]),
    );
    const indexSignal = signal(index);
    const countSignal = signal(count);
    const scope = new Scope(
      this.scope.component,
      this.namesOf(names, indexSignal, countSignal),
    );
    const view = this.render(this.node.body, scope, anchor, this.injector);
    return { key, anchor, view, names, index: indexSignal, count: countSignal };
  }

  /** Put every row's nodes, then its anchor, in order before the map's anchor. */
  private placeRows(): void {
    const parent = this.parent();
    for (const row of this.rows) {
      for (const node of row.view.nodes) {
        this.renderer.insertBefore(parent, node, this.anchor);
      }
      this.renderer.insertBefore(parent, row.anchor, this.anchor);
    }
  }

  private remove(row: Row): void {
    row.view.destroy();
    this.renderer.removeChild(this.parent(), row.anchor);
  }

  /** The node the rows are in: the map's anchor's parent. */
  private parent(): Node {
    const parent = this.anchor.parentNode;
    if (!parent) {
      throw new Error("The anchor of @map is not in the DOM");
    }
    return parent;
  }

  /** Remove every row, when the map's owner is destroyed. */
  private clear(): void {
    for (const row of this.rows) {
      this.remove(row);
    }
    this.rows = [];
  }
}

/** A field of a track item: it must be an object with that field. */
function fieldOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null || !(name in value)) {
    throw new Error(`The track of @map needs the field "${name}" on each item`);
  }
  return (value as Record<string, unknown>)[name];
}

/** What a value is, for an error: a function is probably a signal that was not called. */
function describe(value: unknown): string {
  if (typeof value === "function") {
    return "a function: a signal is read with (), e.g. todos()";
  }
  return value === null ? "null" : typeof value;
}
