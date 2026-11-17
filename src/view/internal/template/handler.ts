// Handlers: what an event does, in the one grammar Tinker supports for now.
//
//   method()        call the method
//   method($event)  call it with the event's value
//
// Used by template event bindings `(name)="method($event)"` and by host
// listeners `"(click)": "method()"`. Arguments, expressions and paths are not
// supported: the handler names one method of the component.

import { Either, type EitherError } from "@tinker/functional";

/** A parsed handler: the method to call, and whether it receives the value. */
export interface Handler {
  readonly method: string;
  readonly passEvent: boolean;
}

const CALL = /^\s*([A-Za-z_$][\w$]*)\(\s*(\$event)?\s*\)\s*$/;

/**
 * Parse `source`, or fail with an error naming `what` it is (e.g. "event
 * handler") and what is supported.
 */
export function parseHandler(source: string, what: string): EitherError<Handler> {
  const match = CALL.exec(source);
  if (!match) {
    return Either.left(
      new Error(`Unsupported ${what} "${source}": write "method()" or "method($event)"`),
    );
  }
  return Either.right({ method: match[1]!, passEvent: match[2] !== undefined });
}
