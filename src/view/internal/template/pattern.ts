// Patterns of `@case`: what a case tests the subject against.
//
//   truthy  falsy  _            truthy or falsy values, or anything
//   "loading"  0  true  null    a literal, compared with ===
//   >= 90  !==  "x"             a relation to a literal: < <= > >= !==
//   string  number  …           a type, checked with typeof
//   status                      anything, bound to that name in the branch
//   { status, index: number }   an object with those keys, each matching its pattern
//
// A header can also say `when` a condition: `@case truthy when ok()`. The
// guard is split off first, at the top level only, since `when` can be a key.

import { Either, type EitherError } from "../../../functional/index.ts";
import { type Expression, ExpressionParser } from "./expression.ts";

export type TypeName = "string" | "number" | "boolean" | "object" | "function";

// `undefined` is a value (a literal), so it is not in this list.
const TYPES: readonly string[] = ["string", "number", "boolean", "object", "function"];
const LITERAL_WORDS: readonly string[] = ["true", "false", "null", "undefined"];
const RELATION = /^(!==|<=|>=|<|>)\s*([\s\S]+)$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const FIELD = /^([A-Za-z_$][\w$]*)\s*(?::([\s\S]*))?$/;

/** What a case tests. */
export type Pattern
  = | { readonly kind: "truthy" }
    | { readonly kind: "falsy" }
    | { readonly kind: "any" }
    | { readonly kind: "value"; readonly value: Literal }
    | { readonly kind: "compare"; readonly operator: RelationOperator; readonly value: Literal }
    | { readonly kind: "type"; readonly type: TypeName }
    | { readonly kind: "bind"; readonly name: string }
    | { readonly kind: "object"; readonly fields: readonly { readonly key: string; readonly pattern: Pattern }[] };

export type RelationOperator = "<" | "<=" | ">" | ">=" | "!==";

/** A literal value a pattern compares with. */
export type Literal = string | number | boolean | null | undefined;

/** A header split at its top-level `when`: the pattern, and the guard if there is one. */
export function splitGuard(header: string): { readonly pattern: string; readonly guard?: string } {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < header.length; i++) {
    const char = header[i]!;
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "{" || char === "(") {
      depth++;
    } else if (char === "}" || char === ")") {
      depth--;
    } else if (depth === 0 && /^when(\s|$)/.test(header.slice(i)) && /\s/.test(header[i - 1] ?? " ")) {
      return { pattern: header.slice(0, i)
        .trim(), guard: header.slice(i + 4)
        .trim() };
    }
  }
  return { pattern: header.trim() };
}

/** The pattern written as `text`, or the error explaining what is not supported. */
export function parsePattern(text: string): EitherError<Pattern> {
  return Either.tryCatchError(() => patternOf(text.trim()));
}

function patternOf(text: string): Pattern {
  if (text === "") {
    throw new Error("A pattern is needed");
  }
  if (text.startsWith("{")) {
    return objectPattern(text);
  }
  switch (text) {
    case "truthy":
      return { kind: "truthy" };
    case "falsy":
      return { kind: "falsy" };
    case "_":
      return { kind: "any" };
    default:
      break;
  }
  if (TYPES.includes(text)) {
    return { kind: "type", type: text as TypeName };
  }
  const relation = RELATION.exec(text);
  if (relation) {
    const value = literalOf(relation[2]!.trim(), `A relation takes a literal: "${text}"`);
    return { kind: "compare", operator: relation[1] as RelationOperator, value };
  }
  if (IDENTIFIER.test(text) && !LITERAL_WORDS.includes(text)) {
    return { kind: "bind", name: text };
  }
  const message = `Only literals, types, truthy, falsy, _ and names are patterns: "${text}"`;
  return { kind: "value", value: literalOf(text, message) };
}

/** The value of a literal, or an error with `message` if the text is not one. */
function literalOf(text: string, message: string): Literal {
  const expression: Expression = ExpressionParser.parse(text)
    .getOrThrow();
  if (expression.kind !== "literal") {
    throw new Error(message);
  }
  return expression.value;
}

/** `{ key, key: pattern, … }`: each key must exist, and its value must match its pattern. */
function objectPattern(text: string): Pattern {
  if (!text.endsWith("}")) {
    throw new Error(`Missing "}" in the pattern "${text}"`);
  }
  const fields: { key: string; pattern: Pattern }[] = [];
  for (const entry of splitTopLevel(text.slice(1, -1))) {
    if (entry.trim() === "") {
      continue;
    }
    const match = FIELD.exec(entry.trim());
    if (!match) {
      throw new Error(`Expected a key in the pattern: "${entry.trim()}"`);
    }
    const key = match[1]!;
    if (fields.some((field) => field.key === key)) {
      throw new Error(`The key "${key}" is in the pattern twice`);
    }
    const pattern = match[2] === undefined ? { kind: "bind" as const, name: key } : patternOf(match[2].trim());
    fields.push({ key, pattern });
  }
  return { kind: "object", fields };
}

/** Split at the commas that are not inside braces, brackets, parentheses or quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "{" || char === "(" || char === "[") {
      depth++;
    } else if (char === "}" || char === ")" || char === "]") {
      depth--;
    } else if (char === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
