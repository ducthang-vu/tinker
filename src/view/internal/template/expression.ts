// Template expressions: the code inside `{{ }}` (and later in bindings like
// `[disabled]="..."`), parsed into a small syntax tree.
//
// Tinker parses expressions itself instead of using `eval` or `new Function`:
// that works under a strict Content Security Policy, and errors can say
// exactly what is not supported.
//
// Operators bind as in JavaScript, from the loosest to the tightest:
//
//   expression := equality
//   equality   := additive ( ("===" | "==") additive )*
//   additive   := term ( ("+" | "-") term )*
//   term       := power ( ("*" | "/") power )*
//   power      := operand ( "**" power )?          right-associative
//   operand    := number | "(" expression ")" | access
//   access     := identifier ( "." identifier | "(" ")" )*
//
//   title              a field of the component
//   count()            a call: e.g. reading a signal, or a method
//   user().name        a field of what a call returned
//   items().length
//   count() * 2 + 1    arithmetic, with parentheses for grouping
//   total === 0        comparisons: === and ==
//
// Call arguments, unary minus and strings come later.

import { Either, type EitherError } from "../../../functional/index.ts";

/** A parsed template expression. */
export type Expression = ComponentReceiver | PropertyRead | Call | Literal | Binary | Not;

/** A value written in the expression: a number, a string, or one of the keyword values. */
export interface Literal {
  readonly kind: "literal";
  readonly value: string | number | boolean | null | undefined;
}

/** The operators, from `===` to `**`. */
export type BinaryOperator
  = | "||" | "&&"
    | "===" | "==" | "!==" | "!="
    | "<" | ">" | "<=" | ">="
    | "+" | "-" | "*" | "/" | "**";

/** Logical not, e.g. `!done`. */
export interface Not {
  readonly kind: "not";
  readonly operand: Expression;
}

/** Two operands and an operator, e.g. `count() * 2`. */
export interface Binary {
  readonly kind: "binary";
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

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
const NUMBER = /\d+(\.\d+)?/y;
const KEYWORD_VALUES: ReadonlyMap<string, boolean | null | undefined> = new Map([
  ["true", true],
  ["false", false],
  ["null", null],
  ["undefined", undefined],
]);
const WHITESPACE = /\s*/y;

/** Parses one expression. Create one per source through `ExpressionParser.parse`. */
export class ExpressionParser {
  private position = 0;

  private constructor(private readonly source: string) {}

  /** Parse `source` into an expression, or the error explaining what is wrong. */
  static parse(source: string): EitherError<Expression> {
    return Either.tryCatchError(() => new ExpressionParser(source)
      .parseAll());
  }

  private parseAll(): Expression {
    this.skipWhitespace();
    if (this.atEnd()) {
      throw new Error(`Empty expression: write a field or a call, e.g. "title" or "count()"`);
    }
    const expression = this.equality();
    this.skipWhitespace();
    if (!this.atEnd()) {
      throw this.error(`Unexpected "${this.source[this.position]}"`);
    }
    return expression;
  }

  /** `===` and `==`: the loosest operators. */
  /** `||`, the loosest operator. */
  private equality(): Expression {
    return this.binaryLevel(["||"], () => this.conjunction());
  }

  /** `&&`. */
  private conjunction(): Expression {
    return this.binaryLevel(["&&"], () => this.comparison());
  }

  /** `===`, `==`, `!==` and `!=`. */
  private comparison(): Expression {
    return this.binaryLevel(["===", "==", "!==", "!="], () => this.relation());
  }

  /** `<`, `>`, `<=` and `>=`. */
  private relation(): Expression {
    return this.binaryLevel(["<=", ">=", "<", ">"], () => this.additive());
  }

  /** A left-associative level: `operand (operator operand)*`, for the given operators. */
  private binaryLevel(operators: readonly string[], operand: () => Expression): Expression {
    let left = operand();
    for (;;) {
      this.skipWhitespace();
      const operator = this.take(operators);
      if (!operator) {
        return left;
      }
      left = { kind: "binary", operator: operator as BinaryOperator, left, right: operand() };
    }
  }

  private additive(): Expression {
    let left = this.term();
    for (;;) {
      this.skipWhitespace();
      const operator = this.take(["+", "-"]);
      if (!operator) {
        return left;
      }
      left = { kind: "binary", operator: operator as BinaryOperator, left, right: this.term() };
    }
  }

  private term(): Expression {
    let left = this.power();
    for (;;) {
      this.skipWhitespace();
      // `**` is read by `power`, so a `*` here is a multiplication.
      const operator = this.take(["*", "/"]);
      if (!operator) {
        return left;
      }
      left = { kind: "binary", operator: operator as BinaryOperator, left, right: this.power() };
    }
  }

  /** `**` is right-associative: `2 ** 3 ** 2` is `2 ** (3 ** 2)`. */
  private power(): Expression {
    const base = this.operand();
    this.skipWhitespace();
    if (!this.take(["**"])) {
      return base;
    }
    return { kind: "binary", operator: "**", left: base, right: this.power() };
  }

  private operand(): Expression {
    this.skipWhitespace();
    if (this.take(["!"])) {
      return { kind: "not", operand: this.operand() };
    }
    if (this.source[this.position] === "(") {
      this.position++;
      const inner = this.equality();
      this.skipWhitespace();
      if (this.source[this.position] !== ")") {
        throw this.error(this.atEnd() ? `Missing ")"` : `Expected ")", found "${this.source[this.position]}"`);
      }
      this.position++;
      return inner;
    }
    const quote = this.source[this.position];
    if (quote === "\"" || quote === "'") {
      return { kind: "literal", value: this.string(quote) };
    }
    NUMBER.lastIndex = this.position;
    const number = NUMBER.exec(this.source);
    if (number) {
      this.position = NUMBER.lastIndex;
      return { kind: "literal", value: Number(number[0]) };
    }
    IDENTIFIER.lastIndex = this.position;
    const word = IDENTIFIER.exec(this.source)?.[0];
    if (word !== undefined && KEYWORD_VALUES.has(word)) {
      this.position += word.length;
      return { kind: "literal", value: KEYWORD_VALUES.get(word) };
    }
    return this.access();
  }

  /**
   * A quoted text, from `quote` to the same quote. A backslash escapes the next
   * character; `\n` and `\t` give a newline and a tab.
   */
  private string(quote: string): string {
    let text = "";
    this.position++;
    while (this.source[this.position] !== quote) {
      if (this.atEnd()) {
        throw this.error(`Missing closing ${quote}`);
      }
      const char = this.source[this.position]!;
      if (char === "\\") {
        this.position++;
        const escaped = this.source[this.position];
        text += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
      } else {
        text += char;
      }
      this.position++;
    }
    this.position++;
    return text;
  }

  /** A name, then any `.name` or `()` after it. */
  private access(): Expression {
    let expression: Expression = { kind: "property", receiver: COMPONENT, name: this.identifier() };
    for (this.skipWhitespace(); !this.atEnd(); this.skipWhitespace()) {
      const char = this.source[this.position];
      if (char !== "." && char !== "(") {
        break;
      }
      expression = this.postfix(expression);
    }
    return expression;
  }

  /** `.name` or `()` after an expression. */
  private postfix(receiver: Expression): Expression {
    const char = this.source[this.position];
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

  /** Consume the first of `tokens` found at the position, if any. */
  private take(tokens: readonly string[]): string | undefined {
    const token = tokens.find((candidate) => this.source.startsWith(candidate, this.position));
    if (token !== undefined) {
      this.position += token.length;
    }
    return token;
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
