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
import type { ViewQueries } from "./view-queries.ts";
import type { CompiledMap, CompiledNode } from "../template/compile.ts";
import { evaluate } from "../template/evaluate.ts";
import { Scope } from "../template/scope.ts";
import { type Context, scopeWith } from "./context.ts";
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
  /** Where the row starts: its nodes are the ones from here to `anchor`, nested blocks included. */
  readonly start: Comment;
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
   * @param queries The component's view queries, told when the rows move.
   */
  constructor(
    private readonly node: CompiledMap,
    private readonly scope: Scope,
    private readonly above: ReadonlyMap<string, ReadonlySignal<unknown>>,
    private readonly anchor: Comment,
    private readonly renderer: Renderer,
    private readonly render: RowRenderer,
    private readonly queries: ViewQueries,
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
    // The row of each item that already has one, updated with its new values.
    const existing = keys.map((key, index) => {
      const row = previous.get(key);
      if (row !== undefined) {
        for (const [name, bound] of this.bindingsOf(list[index])) {
          row.names.get(name)!.set(bound);
        }
        row.index.set(index);
        row.count.set(list.length);
      }
      return row;
    });
    // The rows with no item in the new list go.
    const kept = new Set(existing.filter((row): row is Row => row !== undefined));
    for (const row of this.rows) {
      if (!kept.has(row)) {
        this.remove(row);
      }
    }
    // The rows that stayed, in their old order, against their new order.
    const survivors = this.rows.filter((row) => kept.has(row));
    const reused = existing.filter((row): row is Row => row !== undefined);
    if (reused.some((row, index) => row !== survivors[index])) {
      // A row changed place: every row is placed again, in the new order.
      this.rows = list.map((value, index) =>
        existing[index] ?? this.create(keys[index]!, value, index, list.length, this.anchor));
      this.placeRows();
      return;
    }
    // Only rows came or went: each new row is put just before the row after it,
    // working from the end, so the rows that stayed are not moved.
    const rows = new Array<Row>(list.length);
    let before: Node = this.anchor;
    for (let index = list.length - 1; index >= 0; index--) {
      const row = existing[index]
        ?? this.create(keys[index]!, list[index], index, list.length, before);
      rows[index] = row;
      // A row is its nodes, then its anchor: the row before starts where this one starts.
      before = row.start;
    }
    this.rows = rows;
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
    const scope = scopeWith(
      this.scope.component,
      this.above,
      this.rowContext(names, computed(() => index), computed(() => count)),
    );
    return [evaluate(track.expression, scope)];
  }

  /**
   * The context of a row: its item's names, and the `$` variables the framework gives
   * every row (`$index`, `$count`, `$first`, `$last`, `$even`, `$odd`).
   */
  private rowContext(
    names: ReadonlyMap<string, ReadonlySignal<unknown>>,
    index: ReadonlySignal<number>,
    count: ReadonlySignal<number>,
  ): Context {
    const context = new Map(names);
    context.set("$index", index);
    context.set("$count", count);
    context.set("$first", computed(() => index() === 0));
    context.set("$last", computed(() => index() === count() - 1));
    context.set("$even", computed(() => index() % 2 === 0));
    context.set("$odd", computed(() => index() % 2 === 1));
    return context;
  }

  /** A new row, rendered in the DOM before its place is settled. */
  private create(
    key: readonly unknown[],
    value: unknown,
    index: number,
    count: number,
    before: Node,
  ): Row {
    const start = this.renderer.createComment("");
    this.renderer.insertBefore(this.parent(), start, before);
    const anchor = this.renderer.createComment("");
    this.renderer.insertBefore(this.parent(), anchor, before);
    const names = new Map(
      [...this.bindingsOf(value)].map(([name, bound]) => [name, signal(bound)]),
    );
    const indexSignal = signal(index);
    const countSignal = signal(count);
    const scope = scopeWith(
      this.scope.component,
      this.above,
      this.rowContext(names, indexSignal, countSignal),
    );
    const view = this.render(this.node.body, scope, anchor, this.injector);
    return { key, start, anchor, view, names, index: indexSignal, count: countSignal };
  }

  /** Put every row in order before the map's anchor. */
  private placeRows(): void {
    const parent = this.parent();
    for (const row of this.rows) {
      this.moveRow(parent, row);
    }
    this.queries.reordered();
  }

  /**
   * Move a row's nodes before the map's anchor, from its start marker to its anchor. The walk takes
   * every node in between, so the nodes of a block nested in the row move with it, in order.
   */
  private moveRow(parent: Node, row: Row): void {
    let node: Node | null = row.start;
    while (node !== null) {
      const next: Node | null = node.nextSibling;
      this.renderer.insertBefore(parent, node, this.anchor);
      if (node === row.anchor) {
        return;
      }
      node = next;
    }
  }

  private remove(row: Row): void {
    row.view.destroy();
    this.renderer.removeChild(this.parent(), row.start);
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
