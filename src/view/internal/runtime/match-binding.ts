// A match binding: shows the branch its subject picks, in the place of a match
// node's anchor. The subject is evaluated by the view's watch, so a signal it
// reads changes the branch. The cases are tried in order: a case matches when
// its pattern matches and its guard, if it has one, is truthy. Without a match,
// the default is shown.
//
// A pattern can bind names (`{ status }`): they are signals in the branch's scope,
// so the branch shows the values it matched. A branch is only recreated when the
// case changes; while the same case stays chosen, its bound names are updated.

import type { Injector } from "../../../di/index.ts";
import { computed, type ReadonlySignal, signal, type Signal } from "../../../signals/index.ts";
import type { CompiledMatch, CompiledNode } from "../template/compile.ts";
import { evaluate } from "../template/evaluate.ts";
import type { Literal, Pattern, RelationOperator } from "../template/pattern.ts";
import { Scope } from "../template/scope.ts";
import type { EmbeddedView } from "./embedded-view.ts";
import type { Binding } from "./text-binding.ts";
import type { View } from "./view.ts";

/** Renders a branch: its body, the scope its names are read from, and its element's injector. */
export type BranchRenderer = (
  body: readonly CompiledNode[],
  scope: Scope,
  injector: Injector,
) => EmbeddedView;

/** A choice: the case (or the default, after the last), its body, and its bound names. */
interface Choice {
  readonly key: number;
  readonly body: readonly CompiledNode[] | undefined;
  readonly bindings: ReadonlyMap<string, unknown>;
}

export class MatchBinding implements Binding {
  /** The index of the shown case (the number of cases for the default), once one is shown. */
  private shownKey: number | undefined;
  private shown: EmbeddedView | undefined;
  /** The names bound by the shown branch: signals, so the branch follows their values. */
  private names = new Map<string, Signal<unknown>>();
  /** Set by `attach`, before the first update. */
  private injector!: Injector;

  /**
   * @param node The match: its subject, cases and default.
   * @param scope The names the subject is read from.
   * @param above The `@let`s declared above the match, which its branches see.
   * @param render Renders the chosen branch.
   */
  constructor(
    private readonly node: CompiledMatch,
    private readonly scope: Scope,
    private readonly above: ReadonlyMap<string, ReadonlySignal<unknown>>,
    private readonly render: BranchRenderer,
  ) {}

  /**
   * Set the injector the branches are created under, and hide the shown branch
   * when `view`, which owns the match, is destroyed.
   */
  attach(view: View, injector: Injector): void {
    this.injector = injector;
    view.addDestroyCallback(() => this.hide());
  }

  /** Evaluate the subject, and show the branch it picks. */
  update(): void {
    const subject = this.node.subject;
    const value = subject === undefined ? undefined : evaluate(subject, this.scope);
    const choice = this.choose(value);
    if (choice.key === this.shownKey) {
      // The same case: only the values of its bound names can have changed.
      for (const [name, bound] of choice.bindings) {
        this.names.get(name)!.set(bound);
      }
      return;
    }
    this.shownKey = choice.key;
    this.hide();
    if (choice.body) {
      this.names = new Map([...choice.bindings].map(([name, bound]) => [name, signal(bound)]));
      const lets = new Map(this.above);
      for (const [name, bound] of this.names) {
        lets.set(name, bound);
      }
      this.shown = this.render(choice.body, new Scope(this.scope.component, lets), this.injector);
    }
  }

  /** The first case whose pattern and guard match the value, or the default. */
  private choose(value: unknown): Choice {
    for (const [key, { pattern, guard, body }] of this.node.cases.entries()) {
      const bindings = match(pattern, value);
      if (bindings === undefined) {
        continue;
      }
      // The guard runs only now that its pattern matched, so it can read its names.
      if (guard === undefined || Boolean(evaluate(guard, this.guardScope(bindings)))) {
        return { key, body, bindings };
      }
    }
    return { key: this.node.cases.length, body: this.node.default, bindings: new Map() };
  }

  /** The scope a guard reads: the names above the match, and the names its pattern bound. */
  private guardScope(bindings: ReadonlyMap<string, unknown>): Scope {
    const lets = new Map(this.above);
    for (const [name, bound] of bindings) {
      lets.set(name, computed(() => bound));
    }
    return new Scope(this.scope.component, lets);
  }

  private hide(): void {
    this.shown?.destroy();
    this.shown = undefined;
    this.names = new Map();
  }
}

/**
 * The names a pattern binds to the value, if the value matches it; undefined if it
 * does not. A match of several parts (an object) binds the names of all its parts.
 */
function match(pattern: Pattern, value: unknown): ReadonlyMap<string, unknown> | undefined {
  switch (pattern.kind) {
    case "truthy":
      return Boolean(value) ? new Map() : undefined;
    case "falsy":
      return value ? undefined : new Map();
    case "any":
      return new Map();
    case "value":
      return value === pattern.value ? new Map() : undefined;
    case "type":
      return typeOf(value) === pattern.type ? new Map() : undefined;
    case "compare":
      return compare(pattern.operator, value, pattern.value) ? new Map() : undefined;
    case "bind":
      return new Map([[pattern.name, value]]);
    case "object":
      return matchObject(pattern.fields, value);
  }
}

function matchObject(
  fields: readonly { readonly key: string; readonly pattern: Pattern }[],
  value: unknown,
): ReadonlyMap<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const bindings = new Map<string, unknown>();
  for (const { key, pattern } of fields) {
    if (!(key in value)) {
      return undefined;
    }
    const bound = match(pattern, (value as Record<string, unknown>)[key]);
    if (!bound) {
      return undefined;
    }
    for (const [name, part] of bound) {
      bindings.set(name, part);
    }
  }
  return bindings;
}

/** The relation of the subject to a literal, as JavaScript compares them. */
function compare(operator: RelationOperator, left: unknown, right: Literal): boolean {
  switch (operator) {
    case "<":
      return (left as number) < (right as number);
    case "<=":
      return (left as number) <= (right as number);
    case ">":
      return (left as number) > (right as number);
    case ">=":
      return (left as number) >= (right as number);
    case "!==":
      return left !== right;
  }
}

/** `typeof`, except that `null` is its own type, so that `object` does not match it. */
function typeOf(value: unknown): string {
  return value === null ? "null" : typeof value;
}
