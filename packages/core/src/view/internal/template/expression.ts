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

import { Either, pipe } from "@tinker/functional";

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

/** A syntax error in a template expression: what is wrong, and where it was found. */
export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

/** The result of a parse step: the value, or the error that stopped it. */
type Parsed<T> = Either<T, ExpressionError>;

/** One entry of an object literal: its key and its value. */
interface Field {
  readonly key: string;
  readonly value: Expression;
}

const literal = (value: Literal["value"]): Expression => ({ kind: "literal", value });

/** Parses one expression. Create one per source through `ExpressionParser.parse`. */
export class ExpressionParser {
  private position = 0;

  private constructor(private readonly source: string) {}

  /** Parse `source` into an expression, or the error explaining what is wrong. */
  static parse(source: string): Parsed<Expression> {
    return new ExpressionParser(source)
      .parseAll();
  }

  private parseAll(): Parsed<Expression> {
    this.skipWhitespace();
    if (this.atEnd()) {
      return Either.left(new ExpressionError(`Empty expression: write a field or a call, e.g. "title" or "count()"`));
    }
    return pipe(
      this.conditional(),
      Either.flatMap((expression): Parsed<Expression> => {
        this.skipWhitespace();
        return this.atEnd()
          ? Either.right(expression)
          : Either.left(this.error(`Unexpected "${this.source[this.position]}"`));
      }),
    );
  }

  /**
   * `test ? then : otherwise`, right-associative: `a ? b : c ? d : e` nests in the
   * otherwise. Without a `?`, the value is the test itself.
   */
  private conditional(): Parsed<Expression> {
    return Either.flatMap(this.coalesce(), (test): Parsed<Expression> => {
      this.skipWhitespace();
      if (!this.take(["?"])) {
        return Either.right(test);
      }
      return pipe(
        this.conditional(),
        Either.map((then) => ({ test, then })),
        Either.flatMap((parts) => Either.map(this.colon(), () => parts)),
        Either.flatMap((parts) => Either.map(
          this.conditional(),
          (otherwise) => ({ ...parts, otherwise }),
        )),
        Either.map((parts): Expression => ({ kind: "conditional", ...parts })),
      );
    });
  }

  /** The `:` of a conditional, after any spaces. */
  private colon(): Parsed<void> {
    this.skipWhitespace();
    if (this.take([":"])) {
      return Either.right(undefined);
    }
    return Either.left(this.error(
      this.atEnd() ? `Missing ":" in the conditional` : `Expected ":", found "${this.source[this.position]}"`,
    ));
  }

  /** `a ?? b`: `b` when `a` is null or undefined, else `a`. */
  private coalesce(): Parsed<Expression> {
    return this.binaryLevel(["??"], () => this.equality());
  }

  /** `||`, the loosest operator after `??`. */
  private equality(): Parsed<Expression> {
    return this.binaryLevel(["||"], () => this.conjunction());
  }

  /** `&&`. */
  private conjunction(): Parsed<Expression> {
    return this.binaryLevel(["&&"], () => this.comparison());
  }

  /** `===`, `==`, `!==` and `!=`. */
  private comparison(): Parsed<Expression> {
    return this.binaryLevel(["===", "==", "!==", "!="], () => this.relation());
  }

  /** `<`, `>`, `<=` and `>=`. */
  private relation(): Parsed<Expression> {
    return this.binaryLevel(["<=", ">=", "<", ">"], () => this.additive());
  }

  private additive(): Parsed<Expression> {
    return this.binaryLevel(["+", "-"], () => this.term());
  }

  private term(): Parsed<Expression> {
    // `**` is read by `power`, so a `*` here is a multiplication.
    return this.binaryLevel(["*", "/"], () => this.power());
  }

  /** A left-associative level: `operand (operator operand)*`, for the given operators. */
  private binaryLevel(
    operators: readonly string[],
    operand: () => Parsed<Expression>,
  ): Parsed<Expression> {
    let result = operand();
    for (;;) {
      if (!result.isRight()) {
        return result;
      }
      const left = result.value();
      this.skipWhitespace();
      const operator = this.take(operators);
      if (!operator) {
        return result;
      }
      result = Either.map(operand(), (right): Expression => ({
        kind: "binary",
        operator: operator as BinaryOperator,
        left,
        right,
      }));
    }
  }

  /** `**` is right-associative: `2 ** 3 ** 2` is `2 ** (3 ** 2)`. */
  private power(): Parsed<Expression> {
    return Either.flatMap(this.operand(), (base): Parsed<Expression> => {
      this.skipWhitespace();
      if (!this.take(["**"])) {
        return Either.right(base);
      }
      return Either.map(this.power(), (right): Expression => ({ kind: "binary", operator: "**", left: base, right }));
    });
  }

  private operand(): Parsed<Expression> {
    this.skipWhitespace();
    if (this.take(["!"])) {
      return Either.map(this.operand(), (operand): Expression => ({ kind: "not", operand }));
    }
    if (this.source[this.position] === "(") {
      this.position++;
      return Either.flatMap(this.conditional(), (inner): Parsed<Expression> => {
        this.skipWhitespace();
        if (this.source[this.position] !== ")") {
          return Either.left(this.error(
            this.atEnd() ? `Missing ")"` : `Expected ")", found "${this.source[this.position]}"`,
          ));
        }
        this.position++;
        return Either.right(inner);
      });
    }
    if (this.source[this.position] === "{") {
      return this.objectLiteral();
    }
    if (this.source[this.position] === "[") {
      return this.arrayLiteral();
    }
    const quote = this.source[this.position];
    if (quote === "\"" || quote === "'") {
      return Either.map(this.string(quote), (value): Expression => literal(value));
    }
    NUMBER.lastIndex = this.position;
    const number = NUMBER.exec(this.source);
    if (number) {
      this.position = NUMBER.lastIndex;
      return Either.right(literal(Number(number[0])));
    }
    IDENTIFIER.lastIndex = this.position;
    const word = IDENTIFIER.exec(this.source)?.[0];
    if (word !== undefined && KEYWORD_VALUES.has(word)) {
      this.position += word.length;
      return Either.right(literal(KEYWORD_VALUES.get(word)));
    }
    return this.access();
  }

  /**
   * A quoted text, from `quote` to the same quote. A backslash escapes the next
   * character; `\n` and `\t` give a newline and a tab.
   */
  private string(quote: string): Parsed<string> {
    let text = "";
    this.position++;
    while (this.source[this.position] !== quote) {
      if (this.atEnd()) {
        return Either.left(this.error(`Missing closing ${quote}`));
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
    return Either.right(text);
  }

  /**
   * `{ key: value, shorthand, "quoted": value }`: a key with no value reads
   * the field of that name.
   */
  private objectLiteral(): Parsed<Expression> {
    this.position++;
    return Either.map(
      this.list("}", `Missing "}" in the object`, () => this.objectField()),
      (fields): Expression => ({ kind: "object", fields }),
    );
  }

  /** One entry: `key: value`, a shorthand `key`, or `"key": value`. */
  private objectField(): Parsed<Field> {
    const quote = this.source[this.position];
    const quoted = quote === "\"" || quote === "'";
    return pipe(
      quoted ? this.string(quote) : this.identifier(),
      Either.flatMap((key): Parsed<Field> => {
        this.skipWhitespace();
        if (this.take([":"]) !== undefined) {
          return Either.map(this.conditional(), (value) => ({ key, value }));
        }
        if (quoted) {
          return Either.left(this.error(`A quoted key needs a value, as in "${key}": value`));
        }
        return Either.right({ key, value: { kind: "property", receiver: COMPONENT, name: key } });
      }),
    );
  }

  /** `[a, b]`: the values, in order. */
  private arrayLiteral(): Parsed<Expression> {
    this.position++;
    return Either.map(
      this.list("]", `Missing "]" in the array`, () => this.conditional()),
      (items): Expression => ({ kind: "array", items }),
    );
  }

  /**
   * `item (, item)* close`: the items in order, reading through the closing token.
   * `missing` is the error for a list that ends before it is closed.
   */
  private list<T>(close: string, missing: string, item: () => Parsed<T>): Parsed<readonly T[]> {
    return this.listFrom([], close, missing, item);
  }

  private listFrom<T>(
    items: readonly T[],
    close: string,
    missing: string,
    item: () => Parsed<T>,
  ): Parsed<readonly T[]> {
    const collected = [...items];
    for (;;) {
      this.skipWhitespace();
      if (this.source[this.position] === close) {
        this.position++;
        return Either.right(collected);
      }
      if (this.atEnd()) {
        return Either.left(this.error(missing));
      }
      const next = item();
      if (!next.isRight()) {
        return next.propagate();
      }
      collected.push(next.value());
      this.skipWhitespace();
      if (this.take([","]) === undefined && this.source[this.position] !== close) {
        return Either.left(this.error(
          `Expected "," or "${close}", found "${this.source[this.position] ?? "the end"}"`,
        ));
      }
    }
  }

  /**
   * A name, then any `.name`, `?.name` or `()` after it. Each `?.` guards only its own
   * link, as in JavaScript: `a?.b.c` throws when `a` is set and `a.b` is missing.
   */
  private access(): Parsed<Expression> {
    return Either.flatMap(this.identifier(), (name) => this.accessTail({ kind: "property", receiver: COMPONENT, name }));
  }

  private accessTail(expression: Expression): Parsed<Expression> {
    this.skipWhitespace();
    if (this.atEnd()) {
      return Either.right(expression);
    }
    if (this.startsWithOptionalLink()) {
      this.position += 2;
      return Either.flatMap(this.identifier(), (name) => this.accessTail(
        { kind: "property", receiver: expression, name, optional: true },
      ));
    }
    const char = this.source[this.position];
    if (char !== "." && char !== "(") {
      return Either.right(expression);
    }
    return Either.flatMap(this.postfix(expression), (next) => this.accessTail(next));
  }

  /** `?.` followed by a name: not the ternary's `?` before a number such as `.5`. */
  private startsWithOptionalLink(): boolean {
    return this.source.startsWith("?.", this.position)
      && !/\d/.test(this.source[this.position + 2] ?? "");
  }

  /** `.name` or `()` after an expression. */
  private postfix(receiver: Expression): Parsed<Expression> {
    const char = this.source[this.position];
    this.position++;
    this.skipWhitespace();
    if (char === ".") {
      return Either.map(this.identifier(), (name): Expression => ({ kind: "property", receiver, name }));
    }
    return Either.map(this.arguments(), (args): Expression => ({ kind: "call", callee: receiver, args }));
  }

  /** `a, b)`: the arguments, after the `(`. Reads through the `)`. */
  private arguments(): Parsed<readonly Expression[]> {
    return this.list(")", `Missing ")"`, () => this.conditional());
  }

  private identifier(): Parsed<string> {
    IDENTIFIER.lastIndex = this.position;
    const match = IDENTIFIER.exec(this.source);
    if (!match) {
      return Either.left(this.error(
        this.atEnd() ? "Missing a name at the end" : `Expected a name, found "${this.source[this.position]}"`,
      ));
    }
    this.position = IDENTIFIER.lastIndex;
    return Either.right(match[0]);
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

  private error(message: string): ExpressionError {
    return new ExpressionError(`${message} (at column ${this.position + 1} in "${this.source}")`);
  }
}
