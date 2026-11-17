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

import { Either, type EitherError } from "@tinker/functional";
import { type Expression, ExpressionParser } from "./expression.ts";

export type TypeName = "string" | "number" | "boolean" | "object" | "function";

// `undefined` is a value (a literal), so it is not in this list.
const TYPES: readonly string[] = ["string", "number", "boolean", "object", "function"];
const LITERAL_WORDS: readonly string[] = ["true", "false", "null", "undefined"];
const RELATION = /^(!==|<=|>=|<|>)\s*([\s\S]+)$/;
const RANGE = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/;
const NOT = /^not\s+([\s\S]+)$/;
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
    | { readonly kind: "object"; readonly fields: readonly { readonly key: string; readonly pattern: Pattern }[] }
    | { readonly kind: "array"; readonly items: readonly Pattern[]; readonly rest?: string }
    | { readonly kind: "present" }
    | { readonly kind: "alt"; readonly options: readonly Pattern[] }
    | { readonly kind: "not"; readonly pattern: Pattern }
    | { readonly kind: "range"; readonly min: number; readonly max: number }
    | { readonly kind: "absent" };

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
    } else if (char === "{" || char === "(" || char === "[") {
      depth++;
    } else if (char === "}" || char === ")" || char === "]") {
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
  return Either.from(() => patternOf(text.trim()));
}

function patternOf(text: string): Pattern {
  if (text === "") {
    throw new Error("A pattern is needed");
  }
  // Alternatives first: a leading `{` or `[` may open the first option only.
  const options = splitTopLevel(text, "|");
  if (options.length > 1) {
    return alternatives(options.map((option) => option.trim()), text);
  }
  if (text.startsWith("{")) {
    return objectPattern(text);
  }
  if (text.startsWith("[")) {
    return arrayPattern(text);
  }
  const negated = NOT.exec(text);
  if (negated) {
    const pattern = patternOf(negated[1]!.trim());
    if (namesOf(pattern).length > 0) {
      throw new Error(`"not" cannot bind names: "${text}"`);
    }
    return { kind: "not", pattern };
  }
  const range = RANGE.exec(text);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > max) {
      throw new Error(`A range goes from the smaller number to the larger: "${text}"`);
    }
    return { kind: "range", min, max };
  }
  switch (text) {
    case "truthy":
      return { kind: "truthy" };
    case "falsy":
      return { kind: "falsy" };
    case "_":
      return { kind: "any" };
    case "present":
      return { kind: "present" };
    case "absent":
      throw new Error(`"absent" is the pattern of a key, as in { error: absent }`);
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

/** Alternatives match when one of them does; they bind no names, since only one can. */
function alternatives(options: readonly string[], text: string): Pattern {
  const patterns = options.map((option) => patternOf(option));
  if (patterns.some((pattern) => namesOf(pattern).length > 0)) {
    throw new Error(`Alternatives cannot bind names: "${text}"`);
  }
  return { kind: "alt", options: patterns };
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
    const pattern = fieldPattern(key, match[2]);
    fields.push({ key, pattern });
  }
  return { kind: "object", fields };
}

/**
 * `[]`, `[pattern, …]`, or `[pattern, ...rest]`: the array has exactly those
 * items, or, with a rest, at least those items, and the rest binds the others.
 */
function arrayPattern(text: string): Pattern {
  if (!text.endsWith("]")) {
    throw new Error(`Missing "]" in the pattern "${text}"`);
  }
  const entries = splitTopLevel(text.slice(1, -1))
    .map((entry) => entry.trim());
  if (entries.at(-1) === "") {
    entries.pop();
  }
  const items: Pattern[] = [];
  let rest: string | undefined;
  entries.forEach((entry, index) => {
    if (!entry.startsWith("...")) {
      items.push(patternOf(entry));
      return;
    }
    const name = entry.slice(3)
      .trim();
    if (index !== entries.length - 1) {
      throw new Error(`The rest of an array pattern comes last: "${text}"`);
    }
    if (!IDENTIFIER.test(name) || LITERAL_WORDS.includes(name)) {
      throw new Error(`The rest of an array pattern needs a name: "${entry}"`);
    }
    rest = name;
  });
  return rest === undefined ? { kind: "array", items } : { kind: "array", items, rest };
}

/** The names a pattern binds, in order. */
export function namesOf(pattern: Pattern): string[] {
  switch (pattern.kind) {
    case "bind":
      return [pattern.name];
    case "object":
      return pattern.fields.flatMap((field) => namesOf(field.pattern));
    case "array":
      return [
        ...pattern.items.flatMap(namesOf),
        ...(pattern.rest === undefined ? [] : [pattern.rest]),
      ];
    default:
      return [];
  }
}

/** The pattern of an object field: its key's value, or the key's name when it has none. */
function fieldPattern(key: string, value: string | undefined): Pattern {
  if (value === undefined) {
    return { kind: "bind", name: key };
  }
  return value.trim() === "absent" ? { kind: "absent" } : patternOf(value.trim());
}

/** Split at the `separator`s that are not inside braces, brackets, parentheses or quotes. */
function splitTopLevel(text: string, separator = ","): string[] {
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
    } else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
