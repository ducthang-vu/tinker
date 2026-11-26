// Memoised template functions: a call with the same arguments as last time gives the last result,
// without running the function again. In development mode a call that reads a signal is reported:
// the memo would not see that signal change, so the template could show a stale result.

import { memoise } from "@tinker/functional";
import { countReads } from "../../../signals/index.ts";
import type { NameChecks } from "./scope.ts";

/**
 * `call`, memoised: the same arguments (by `Object.is`) as the last call give its result again.
 * Only the last call is kept.
 *
 * @param call The call to memoise, run with the arguments the template gives.
 * @param checks The dev-mode checks, when the app is in development mode; otherwise undefined.
 * @param describe Names the function in a warning, as "Owner.name".
 * @returns A function with the same arguments and result as `call`, which runs `call` only when
 *   the arguments are not those of the last call.
 */
export function memoisedCall(
  call: (...args: unknown[]) => unknown,
  checks: NameChecks | undefined,
  describe: string,
): (...args: unknown[]) => unknown {
  return memoise((...args: unknown[]) => {
    if (checks === undefined) {
      return call(...args);
    }
    const { value, reads } = countReads(() => call(...args));
    if (reads > 0) {
      checks.warn(`${describe} is memoised, but it reads a signal: its result is not updated when the signal changes. Opt out with { memoise: false }`);
    }
    return value;
  });
}
