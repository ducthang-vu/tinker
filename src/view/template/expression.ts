// Template expressions: the code inside `{{ }}` (and later in bindings like
// `[disabled]="..."`), parsed into a small syntax tree.
//
// Tinker parses expressions itself instead of using `eval` or `new Function`:
// that works under a strict Content Security Policy, and errors can say
// exactly what is not supported.
//
// For now only fields and calls without arguments, read from the component:
//
//   expression := identifier ( "." identifier | "(" ")" )*
//
//   title            a field of the component
//   count()          a call: e.g. reading a signal, or a method
//   user().name      a field of what a call returned
//   items().length
//
// Literals, operators, call arguments and pipes come later.

import { Either, type EitherError } from "../../functional/index.ts";

/** A parsed template expression. */
export type Expression = ComponentReceiver | PropertyRead | Call;

/** Where a bare name is looked up: the component instance (`title` means `component.title`). */
export interface ComponentReceiver {
  readonly kind: "component";
}

/** Reading a field, e.g. `title` or `user().name`. */
export interface PropertyRead {
  readonly kind: "property";
  /** What the field is read from: the component for a bare name. */
  readonly receiver: Expression;
  readonly name: string;
}

/** Calling something without arguments, e.g. `count()`. */
export interface Call {
  readonly kind: "call";
  /** What is called; a method keeps its receiver as `this`. */
  readonly callee: Expression;
}

const COMPONENT: ComponentReceiver = { kind: "component" };
const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
const WHITESPACE = /\s*/y;

/** Parses one expression. Create one per source through `ExpressionParser.parse`. */
export class ExpressionParser {
  private position = 0;

  private constructor(private readonly source: string) {}

  /** Parse `source` into an expression, or the error explaining what is wrong. */
  static parse(source: string): EitherError<Expression> {
    return Either.tryCatchError(() => new ExpressionParser(source).parseAll());
  }

  private parseAll(): Expression {
    this.skipWhitespace();
    if (this.atEnd()) {
      throw new Error(`Empty expression: write a field or a call, e.g. "title" or "count()"`);
    }
    let expression: Expression = { kind: "property", receiver: COMPONENT, name: this.identifier() };
    for (this.skipWhitespace(); !this.atEnd(); this.skipWhitespace()) {
      expression = this.postfix(expression);
    }
    return expression;
  }

  /** `.name` or `()` after an expression. */
  private postfix(receiver: Expression): Expression {
    const char = this.source[this.position];
    if (char !== "." && char !== "(") {
      throw this.error(`Unexpected "${char}": only fields and calls are supported for now`);
    }
    this.position++;
    this.skipWhitespace();
    if (char === ".") {
      return { kind: "property", receiver, name: this.identifier() };
    }
    if (this.source[this.position] !== ")") {
      throw this.error(this.atEnd() ? `Missing ")"` : "Call arguments are not supported yet");
    }
    this.position++;
    return { kind: "call", callee: receiver };
  }

  private identifier(): string {
    IDENTIFIER.lastIndex = this.position;
    const match = IDENTIFIER.exec(this.source);
    if (!match) {
      throw this.error(this.atEnd() ? "Missing a name at the end" : `Expected a name, found "${this.source[this.position]}"`);
    }
    this.position = IDENTIFIER.lastIndex;
    return match[0];
  }

  private skipWhitespace(): void {
    WHITESPACE.lastIndex = this.position;
    WHITESPACE.exec(this.source);
    this.position = WHITESPACE.lastIndex;
  }

  private atEnd(): boolean {
    return this.position >= this.source.length;
  }

  private error(message: string): Error {
    return new Error(`${message} (at column ${this.position + 1} in "${this.source}")`);
  }
}
