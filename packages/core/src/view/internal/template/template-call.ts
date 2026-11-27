// How a template calls a template function. A call sees only its arguments: it runs untracked, so
// a signal it reads inside is not a dependency of the view, and never makes the view re-run. The
// template reads the signals and passes their values in, as in `{{ format(price()) }}`. A memoised
// function gives its last result again when the arguments are those of the last call.

import { memoise } from "@tinker/functional";
import { untracked } from "../../../signals/index.ts";
import type { TemplateFunctionContract } from "../authoring/template-function.ts";

/**
 * What the template calls for the template function `fn`: its `call()`, run untracked, and
 * memoised when `memoised` is true. A memoised call with the same arguments (by `Object.is`) as the
 * last call gives that call's result again; only the last call is kept.
 *
 * @param fn The template function instance.
 * @param memoised Whether its calls are memoised.
 * @returns The contract the template calls, with the same arguments and result as `fn.call`.
 */
export function templateCall(
  fn: TemplateFunctionContract,
  memoised: boolean,
): TemplateFunctionContract {
  const call = (...args: unknown[]): unknown => untracked(() => fn.call(...args));
  return { call: memoised ? memoise(call) : call };
}
