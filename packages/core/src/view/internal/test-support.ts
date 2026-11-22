import { type Either, match } from "@tinker/functional/v1";
import type { TemplateNode } from "./template/ast.ts";
import { TinkerTemplateParser } from "./template/tinker-parser.ts";
// Helpers for core's own tests. Not part of the public API.

/** The message of a failure, or "no error" for a success: what a test checks against. */
export const messageOf = (result: Either<unknown, Error>): string =>
  match(result, { Left: (error) => error.message, Right: () => "no error" });

/**
 * Wait for the next tick of the app's ticker, so the first render and any pending
 * change detection have run: `await tick()` after `bootstrap` or a write to a signal.
 */
export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

/** The nodes of a template that must parse: a syntax error is thrown, so a test fails with it. */
export function parseNodes(source: string): readonly TemplateNode[] {
  return match(new TinkerTemplateParser()
    .parse(source), {
    Right: (nodes) => nodes,
    Left: (error) => {
      throw error;
    },
  });
}
