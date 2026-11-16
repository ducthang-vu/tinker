// A match binding: shows the branch its subject picks, in the place of a match
// node's anchor. The subject is evaluated by the view's watch, so a signal it
// reads changes the branch. The cases are tried in order, and the first one
// whose pattern matches is shown; without one, the default is shown.
//
// A branch is an embedded view with its own watch. It is only recreated when the
// branch changes, not while the subject keeps picking the same one.

import type { Injector } from "../../../di/index.ts";
import type { ReadonlySignal } from "../../../signals/index.ts";
import type { CompiledMatch, CompiledNode, Pattern } from "../template/compile.ts";
import { evaluate } from "../template/evaluate.ts";
import { Scope } from "../template/scope.ts";
import type { EmbeddedView } from "./embedded-view.ts";
import type { View } from "./view.ts";
import type { Binding } from "./text-binding.ts";

/** Renders a branch: its body, the scope its names are read from, and its element's injector. */
export type BranchRenderer = (
  body: readonly CompiledNode[],
  scope: Scope,
  injector: Injector,
) => EmbeddedView;

export class MatchBinding implements Binding {
  /** The index of the shown case (the number of cases for the default), once one is shown. */
  private shownKey: number | undefined;
  private shown: EmbeddedView | undefined;
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

  /**
   * Evaluate the subject, and show the branch the first matching case picks, if
   * that changed. A case matches when its pattern does and its guard, if it has
   * one, is truthy: the guard is not evaluated when the pattern does not match.
   */
  update(): void {
    const subject = this.node.subject;
    const value = subject === undefined ? undefined : evaluate(subject, this.scope);
    const index = this.node.cases.findIndex(
      ({ pattern, guard }) =>
        matches(pattern, value) && (guard === undefined || Boolean(evaluate(guard, this.scope))),
    );
    const key = index === -1 ? this.node.cases.length : index;
    if (key === this.shownKey) {
      return;
    }
    this.shownKey = key;
    this.hide();
    const body = index === -1 ? this.node.default : this.node.cases[index]!.body;
    if (body) {
      const scope = new Scope(this.scope.component, new Map(this.above));
      this.shown = this.render(body, scope, this.injector);
    }
  }

  private hide(): void {
    this.shown?.destroy();
    this.shown = undefined;
  }
}

function matches(pattern: Pattern, value: unknown): boolean {
  switch (pattern.kind) {
    case "truthy":
      return Boolean(value);
    case "falsy":
      return !value;
    case "any":
      return true;
    case "value":
      return value === pattern.value;
  }
}
