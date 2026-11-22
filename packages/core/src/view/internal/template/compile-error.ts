// Errors of the template compiler, with the place in the source they are about.
// It is its own module so that blocks.ts, which compile.ts uses, can raise them too.

import type { Span } from "./ast.ts";
import type { Either } from "@tinker/functional/v1";

/** The result of a compile step: its value, or the error that stopped it. */
export type Parsed<T> = Either<T, Error>;

/** A template that does not compile, with the span of the text, element or block it is in. */
export class TemplateCompileError extends Error {
  constructor(message: string, readonly span: Span) {
    super(message);
    this.name = "TemplateCompileError";
  }
}

/** An error about `span`, or a plain error when the place is not known (a tree built by hand). */
export function compileError(message: string, span: Span | undefined): Error {
  return span === undefined ? new Error(message) : new TemplateCompileError(message, span);
}

/**
 * Runs `compile` for the item at `span`. An error it throws gets that span, unless an
 * inner item already gave it one (the innermost place is the useful one).
 */
export function locatedAt<T>(span: Span | undefined, compile: () => T): T {
  try {
    return compile();
  } catch (error) {
    if (span === undefined || error instanceof TemplateCompileError) {
      throw error;
    }
    throw compileError((error as Error).message, span);
  }
}

/**
 * `error` with the span of the item it is in. An error that already has a span keeps it: the
 * innermost place is the useful one.
 */
export function located(error: Error, span: Span | undefined): Error {
  if (span === undefined || error instanceof TemplateCompileError) {
    return error;
  }
  return compileError(error.message, span);
}
