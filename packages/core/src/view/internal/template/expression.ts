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

import { Either, type EitherError } from "@tinker/functional";

/** A parsed template expression. */
export type Expression
  = | ComponentReceiver
    | PropertyRead
    | Call
    | Literal
    | Binary
    | Not
    | Conditional
    | ObjectLiteral
    | ArrayLiteral;

/** `{ key: value, shorthand }`: an object of the values, in order. */
export interface ObjectLiteral {
  readonly kind: "object";
  readonly fields: readonly { readonly key: string; readonly value: Expression }[];
}

/** `[a, b]`: an array of the values, in order. */
export interface ArrayLiteral {
  readonly kind: "array";
  readonly items: readonly Expression[];
}

/** `test ? then : otherwise`: the value of `then` when `test` is truthy, else `otherwise`. */
export interface Conditional {
  readonly kind: "conditional";
  readonly test: Expression;
  readonly then: Expression;
  readonly otherwise: Expression;
}

/** A value written in the expression: a number, a string, or one of the keyword values. */
export interface Literal {
  readonly kind: "literal";
  readonly value: string | number | boolean | null | undefined;
}

/** The operators, from `===` to `**`. */
export type BinaryOperator
  = | "??" | "||" | "&&"
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
  /** `?.`: when the receiver is null or undefined, the value is undefined, not an error. */
  readonly optional?: boolean;
}

/** A call, e.g. `count()` or `select(item.id, $event)`. */
export interface Call {
  readonly kind: "call";
  /** What is called; a method keeps its receiver as `this`. */
  readonly callee: Expression;
  /** The arguments, in order, each an expression of its own. */
  readonly args: readonly Expression[];
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
    const expression = this.conditional();
    this.skipWhitespace();
    if (!this.atEnd()) {
      throw this.error(`Unexpected "${this.source[this.position]}"`);
    }
    return expression;
  }

  /** `===` and `==`: the loosest operators. */
  /** `||`, the loosest operator. */
  /** `test ? then : otherwise`, right-associative: `a ? b : c ? d : e` nests in the otherwise. */
  private conditional(): Expression {
    const test = this.coalesce();
    this.skipWhitespace();
    if (!this.take(["?"])) {
      return test;
    }
    const then = this.conditional();
    this.skipWhitespace();
    if (!this.take([":"])) {
      throw this.error(
        this.atEnd() ? `Missing ":" in the conditional` : `Expected ":", found "${this.source[this.position]}"`,
      );
    }
    return { kind: "conditional", test, then, otherwise: this.conditional() };
  }

  /** `a ?? b`: `b` when `a` is null or undefined, else `a`. */
  private coalesce(): Expression {
    return this.binaryLevel(["??"], () => this.equality());
  }

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
      const inner = this.conditional();
      this.skipWhitespace();
      if (this.source[this.position] !== ")") {
        throw this.error(this.atEnd() ? `Missing ")"` : `Expected ")", found "${this.source[this.position]}"`);
      }
      this.position++;
      return inner;
    }
    if (this.source[this.position] === "{") {
      return this.objectLiteral();
    }
    if (this.source[this.position] === "[") {
      return this.arrayLiteral();
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

  /**
   * `{ key: value, shorthand, "quoted": value }`: a key with no value reads
   * the field of that name.
   */
  private objectLiteral(): Expression {
    this.position++;
    const fields: { key: string; value: Expression }[] = [];
    for (this.skipWhitespace(); this.source[this.position] !== "}"; this.skipWhitespace()) {
      if (this.atEnd()) {
        throw this.error(`Missing "}" in the object`);
      }
      const quote = this.source[this.position];
      const quoted = quote === "\"" || quote === "'";
      const key = quoted ? this.string(quote) : this.identifier();
      this.skipWhitespace();
      if (this.take([":"]) !== undefined) {
        fields.push({ key, value: this.conditional() });
      } else if (quoted) {
        throw this.error(`A quoted key needs a value, as in "${key}": value`);
      } else {
        fields.push({ key, value: { kind: "property", receiver: COMPONENT, name: key } });
      }
      this.skipWhitespace();
      if (this.take([","]) === undefined && this.source[this.position] !== "}") {
        throw this.error(`Expected "," or "}", found "${this.source[this.position] ?? "the end"}"`);
      }
    }
    this.position++;
    return { kind: "object", fields };
  }

  /** `[a, b]`: the values, in order. */
  private arrayLiteral(): Expression {
    this.position++;
    const items: Expression[] = [];
    for (this.skipWhitespace(); this.source[this.position] !== "]"; this.skipWhitespace()) {
      if (this.atEnd()) {
        throw this.error(`Missing "]" in the array`);
      }
      items.push(this.conditional());
      this.skipWhitespace();
      if (this.take([","]) === undefined && this.source[this.position] !== "]") {
        throw this.error(`Expected "," or "]", found "${this.source[this.position] ?? "the end"}"`);
      }
    }
    this.position++;
    return { kind: "array", items };
  }

  /**
   * A name, then any `.name`, `?.name` or `()` after it. Each `?.` guards only its own
   * link, as in JavaScript: `a?.b.c` throws when `a` is set and `a.b` is missing.
   */
  private access(): Expression {
    let expression: Expression = { kind: "property", receiver: COMPONENT, name: this.identifier() };
    for (this.skipWhitespace(); !this.atEnd(); this.skipWhitespace()) {
      if (this.startsWithOptionalLink()) {
        this.position += 2;
        expression = { kind: "property", receiver: expression, name: this.identifier(), optional: true };
        continue;
      }
      const char = this.source[this.position];
      if (char !== "." && char !== "(") {
        break;
      }
      expression = this.postfix(expression);
    }
    return expression;
  }

  /** `?.` followed by a name: not the ternary's `?` before a number such as `.5`. */
  private startsWithOptionalLink(): boolean {
    return this.source.startsWith("?.", this.position)
      && !/\d/.test(this.source[this.position + 2] ?? "");
  }

  /** `.name` or `()` after an expression. */
  private postfix(receiver: Expression): Expression {
    const char = this.source[this.position];
    this.position++;
    this.skipWhitespace();
    if (char === ".") {
      return { kind: "property", receiver, name: this.identifier() };
    }
    return { kind: "call", callee: receiver, args: this.arguments() };
  }

  /** `a, b)`: the arguments, after the `(`. Reads through the `)`. */
  private arguments(): Expression[] {
    const args: Expression[] = [];
    for (this.skipWhitespace(); this.source[this.position] !== ")"; this.skipWhitespace()) {
      if (this.atEnd()) {
        throw this.error(`Missing ")"`);
      }
      args.push(this.conditional());
      this.skipWhitespace();
      if (this.take([","]) === undefined && this.source[this.position] !== ")") {
        throw this.error(`Expected "," or ")", found "${this.source[this.position] ?? "the end"}"`);
      }
    }
    this.position++;
    return args;
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
