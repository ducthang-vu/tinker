// Patterns of `@case`: what a case tests the subject against.
//
//   truthy  falsy  _            truthy or falsy values, or anything
//   "loading"  0  true  null    a literal, compared with ===
//   >= 90  !==  "x"             a relation to a literal: < <= > >= !==
//   string  number  …           a type, checked with typeof
//   status                      anything, bound to that name in the branch
//   { status, index: number }   an object with those keys, each matching its pattern
//   some(x)  none  ok(x)  error(e)   a Maybe or an Either: the payload matches x or e
//   { id, name } as user             a pattern, plus the whole value bound to `user`
//   /^\d+$/  /(?<id>\d+)/i          a string matched by a regex; named groups bind names
//
// A header can also say `when` a condition: `@case truthy when ok()`. The
// guard is split off first, at the top level only, since `when` can be a key.

import { type Either, Left, Right, flatMap, map, mapLeft, match, toError } from "@tinker/functional";
import { eachOf } from "../../../utils/each-of.ts";
import { type Expression, ExpressionParser } from "./expression.ts";

export type TypeName = "string" | "number" | "boolean" | "object" | "function";

// `undefined` is a value (a literal), so it is not in this list.
const TYPES: readonly string[] = ["string", "number", "boolean", "object", "function"];
const LITERAL_WORDS: readonly string[] = ["true", "false", "null", "undefined"];
const RELATION = /^(!==|<=|>=|<|>)\s*([\s\S]+)$/;
const RANGE = /^(-?\d+(?:\.\d+)?)?\.\.(-?\d+(?:\.\d+)?)?$/;
const NOT = /^not\s+([\s\S]+)$/;
const WRAPPED = /^(some|ok|error)\s*\(([\s\S]*)\)$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const FIELD = /^([A-Za-z_$][\w$]*)\s*(?::([\s\S]*))?$/;
// ` as name` at the end of a pattern. Only one such suffix can match, since the name has no spaces.
const ALIAS = /\s+as\s+([A-Za-z_$][\w$]*)$/;

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
    | { readonly kind: "range"; readonly min?: number; readonly max?: number }
    | { readonly kind: "absent" }
    | { readonly kind: "some"; readonly pattern: Pattern }
    | { readonly kind: "none" }
    | { readonly kind: "ok"; readonly pattern: Pattern }
    | { readonly kind: "error"; readonly pattern: Pattern }
    | { readonly kind: "as"; readonly pattern: Pattern; readonly name: string }
    | { readonly kind: "regex"; readonly source: string; readonly flags: string; readonly names: readonly string[] };

export type RelationOperator = "<" | "<=" | ">" | ">=" | "!==";

/** A literal value a pattern compares with. */
export type Literal = string | number | boolean | null | undefined;

/**
 * Tracks whether a scan is inside a quoted string. A backslash inside a string escapes
 * the next character, as the expression parser does, so `"\""` is one string.
 */
export class QuoteTracker {
  private quote: string | undefined;
  private escaped = false;

  /** Whether the character is part of a string (its quotes included), so the scan skips it. */
  step(char: string): boolean {
    if (this.quote === undefined) {
      if (char === "\"" || char === "'") {
        this.quote = char;
        return true;
      }
      return false;
    }
    if (this.escaped) {
      this.escaped = false;
    } else if (char === "\\") {
      this.escaped = true;
    } else if (char === this.quote) {
      this.quote = undefined;
    }
    return true;
  }

  /** Whether the scan is inside a string now. */
  get open(): boolean {
    return this.quote !== undefined;
  }
}

/** A header split at its top-level `when`: the pattern, and the guard if there is one. */
export function splitGuard(header: string): { readonly pattern: string; readonly guard?: string } {
  // The scan reads a copy with the regex literals blanked, so a `when` inside one is not a guard.
  const scan = blankRegexes(header);
  let depth = 0;
  const quotes = new QuoteTracker();
  for (let i = 0; i < scan.length; i++) {
    const char = scan[i]!;
    if (quotes.step(char)) {
      // A character of a string is never structure.
    } else if (char === "{" || char === "(" || char === "[") {
      depth++;
    } else if (char === "}" || char === ")" || char === "]") {
      depth--;
    } else if (depth === 0 && /^when(\s|$)/.test(scan.slice(i)) && /\s/.test(scan[i - 1] ?? " ")) {
      return { pattern: header.slice(0, i)
        .trim(), guard: header.slice(i + 4)
        .trim() };
    }
  }
  return { pattern: header.trim() };
}

/** The pattern written as `text`, or the error explaining what is not supported. */
/** A pattern that is not supported: what is wrong with it. */
export class PatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatternError";
  }
}

/** The result of a parse step: the value, or the error that stopped it. */
type Parsed<T> = Either<T, PatternError>;

/** One key of an object pattern, with the pattern its value must match. */
interface Field {
  readonly key: string;
  readonly pattern: Pattern;
}

/** The error for a pattern that is not supported. */
function fail<T = never>(message: string): Parsed<T> {
  return Left.of(new PatternError(message));
}

export function parsePattern(text: string): Parsed<Pattern> {
  // Regex literals are masked first, so their braces, bars and quotes are not read as structure.
  return mapLeft(
    patternOf(maskRegexes(text.trim())),
    (error) => new PatternError(restoreRegexes(error.message)),
  );
}

function patternOf(text: string): Parsed<Pattern> {
  if (text === "") {
    return fail("A pattern is needed");
  }
  const literal = MASKED_REGEX.exec(text);
  if (literal) {
    return regexPattern(decodeLiteral(literal[1]!));
  }
  // `as` comes first: it names the whole pattern, alternatives included.
  const alias = aliasOf(text);
  if (alias) {
    return aliasPattern(alias.pattern, alias.name, text);
  }
  // Alternatives next: a leading `{` or `[` may open the first option only.
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
  if (isWholeGroup(text)) {
    return tupleOf(text);
  }
  const negated = NOT.exec(text);
  if (negated) {
    return flatMap(patternOf(negated[1]!.trim()), (pattern): Parsed<Pattern> =>
      namesOf(pattern).length > 0
        ? fail(`"not" cannot bind names: "${text}"`)
        : Right.of({ kind: "not", pattern }));
  }
  const wrapped = WRAPPED.exec(text);
  if (wrapped) {
    return map(patternOf(wrapped[2]!.trim()), (pattern): Pattern => {
      switch (wrapped[1]) {
        case "some":
          return { kind: "some", pattern };
        case "ok":
          return { kind: "ok", pattern };
        default:
          return { kind: "error", pattern };
      }
    });
  }
  const range = RANGE.exec(text);
  if (range && (range[1] !== undefined || range[2] !== undefined)) {
    return rangeOf(range[1], range[2], text);
  }
  switch (text) {
    case "truthy":
      return Right.of({ kind: "truthy" });
    case "falsy":
      return Right.of({ kind: "falsy" });
    case "_":
      return Right.of({ kind: "any" });
    case "present":
      return Right.of({ kind: "present" });
    case "none":
      return Right.of({ kind: "none" });
    case "absent":
      return fail(`"absent" is the pattern of a key, as in { error: absent }`);
    default:
      break;
  }
  if (TYPES.includes(text)) {
    return Right.of({ kind: "type", type: text as TypeName });
  }
  const relation = RELATION.exec(text);
  if (relation) {
    return map(
      literalOf(relation[2]!.trim(), `A relation takes a literal: "${text}"`),
      (value): Pattern => ({ kind: "compare", operator: relation[1] as RelationOperator, value }),
    );
  }
  if (IDENTIFIER.test(text) && !LITERAL_WORDS.includes(text)) {
    return Right.of({ kind: "bind", name: text });
  }
  const message = `Only literals, types, truthy, falsy, _ and names are patterns: "${text}"`;
  return map(literalOf(text, message), (value): Pattern => ({ kind: "value", value }));
}

/** The value of a literal, or an error with `message` if the text is not one. */
function literalOf(text: string, message: string): Parsed<Literal> {
  return flatMap(
    mapLeft(ExpressionParser.parse(text), (error) => new PatternError(error.message)),
    (expression): Parsed<Literal> => (expression.kind === "literal"
      ? Right.of(expression.value)
      : fail(message)),
  );
}

/**
 * `pattern as name`: the pattern, and the whole value bound to `name`. The ` as `
 * counts only outside braces, brackets, parentheses and quotes, so `{ as }` is a key.
 */
function aliasOf(text: string): { pattern: string; name: string } | undefined {
  const match = ALIAS.exec(text);
  if (!match || !isTopLevel(text, match.index)) {
    return undefined;
  }
  return { pattern: text.slice(0, match.index), name: match[1]! };
}

function aliasPattern(text: string, name: string, whole: string): Parsed<Pattern> {
  if (LITERAL_WORDS.includes(name)) {
    return fail(`"${name}" cannot be a name: "${whole}"`);
  }
  return flatMap(patternOf(text.trim()), (pattern): Parsed<Pattern> =>
    namesOf(pattern)
      .includes(name)
      ? fail(`The name "${name}" is bound twice in "${whole}"`)
      : Right.of({ kind: "as", pattern, name }));
}

/** Whether `index` in `text` is outside every brace, bracket, parenthesis and quote. */
function isTopLevel(text: string, index: number): boolean {
  let depth = 0;
  const quotes = new QuoteTracker();
  for (const char of text.slice(0, index)) {
    if (quotes.step(char)) {
      // A character of a string is never structure.
    } else if (char === "{" || char === "(" || char === "[") {
      depth++;
    } else if (char === "}" || char === ")" || char === "]") {
      depth--;
    }
  }
  return depth === 0 && !quotes.open;
}

/**
 * `min..max`, `min..` or `..max`: the numbers from min to max, both included. A
 * missing bound is open. The bounds are written as numbers, so a range never has
 * an undefined bound (the key is left out).
 */
function rangeOf(low: string | undefined, high: string | undefined, text: string): Parsed<Pattern> {
  const min = low === undefined ? undefined : Number(low);
  const max = high === undefined ? undefined : Number(high);
  if (min !== undefined && max !== undefined && min > max) {
    return fail(`A range goes from the smaller number to the larger: "${text}"`);
  }
  return Right.of({
    kind: "range",
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  });
}

/**
 * Alternatives match when one of them does. Each option must bind the same names,
 * so the names mean the same thing whichever option matched: `{ status: "ok", value }
 * | { status: "cached", value }` binds `value` either way.
 */
function alternatives(options: readonly string[], text: string): Parsed<Pattern> {
  const parsed = eachOf(options, (option) => patternOf(option));
  return flatMap(parsed, (patterns): Parsed<Pattern> => {
    const [first, ...rest] = patterns.map((pattern) => sortedNames(pattern));
    return rest.some((names) => names.join() !== first!.join())
      ? fail(`Alternatives must bind the same names, or none: "${text}"`)
      : Right.of({ kind: "alt", options: patterns });
  });
}

/** The names a pattern binds, sorted, without duplicates. */
function sortedNames(pattern: Pattern): string[] {
  return [...new Set(namesOf(pattern))].sort();
}

/** `{ key, key: pattern, … }`: each key must exist, and its value must match its pattern. */
function objectPattern(text: string): Parsed<Pattern> {
  if (!text.endsWith("}")) {
    return fail(`Missing "}" in the pattern "${text}"`);
  }
  const entries = splitTopLevel(text.slice(1, -1))
    .filter((entry) => entry.trim() !== "");
  return flatMap(fieldsOf(entries, []), (fields) => objectOf(fields, text));
}

/** An object pattern of `fields`, if no name is bound twice. */
function objectOf(fields: readonly Field[], text: string): Parsed<Pattern> {
  return map(
    distinctNames(fields.flatMap((field) => namesOf(field.pattern)), text),
    (): Pattern => ({ kind: "object", fields }),
  );
}

/** The fields of an object pattern, one entry at a time: each key must be new. */
function fieldsOf(entries: readonly string[], fields: readonly Field[]): Parsed<readonly Field[]> {
  const [entry, ...others] = entries;
  if (entry === undefined) {
    return Right.of(fields);
  }
  const match = FIELD.exec(entry.trim());
  if (!match) {
    return fail(`Expected a key in the pattern: "${entry.trim()}"`);
  }
  const key = match[1]!;
  if (fields.some((field) => field.key === key)) {
    return fail(`The key "${key}" is in the pattern twice`);
  }
  return flatMap(fieldPattern(key, match[2]), (pattern) =>
    fieldsOf(others, [...fields, { key, pattern }]));
}

/**
 * `(a, b)` is the array pattern `[a, b]`: a tuple. Parentheses around one pattern
 * with no comma only group it, so `(1 | 2)` is the alternatives, and `(a,)` is a
 * tuple of one.
 */
function tupleOf(text: string): Parsed<Pattern> {
  const inner = text.slice(1, -1);
  if (inner.trim() === "") {
    return arrayPattern("[]");
  }
  const entries = splitTopLevel(inner);
  const single = entries.length === 1 && entries[0]!.trim() !== "";
  return single ? patternOf(entries[0]!.trim()) : arrayPattern(`[${inner}]`);
}

/** Whether the text is one parenthesized group: its first `(` closes at the end. */
function isWholeGroup(text: string): boolean {
  if (!text.startsWith("(")) {
    return false;
  }
  let depth = 0;
  const quotes = new QuoteTracker();
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quotes.step(char)) {
      // A character of a string is never structure.
    } else if (char === "(" || char === "{" || char === "[") {
      depth++;
    } else if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (depth === 0) {
        return index === text.length - 1;
      }
    }
  }
  return false;
}

/**
 * `[]`, `[pattern, …]`, or `[pattern, ...rest]`: the array has exactly those
 * items, or, with a rest, at least those items, and the rest binds the others.
 */
function arrayPattern(text: string): Parsed<Pattern> {
  if (!text.endsWith("]")) {
    return fail(`Missing "]" in the pattern "${text}"`);
  }
  const entries = splitTopLevel(text.slice(1, -1))
    .map((entry) => entry.trim());
  if (entries.at(-1) === "") {
    entries.pop();
  }
  return flatMap(arrayItems(entries, text, []), (parts) => arrayOf(parts, text));
}

/** An array pattern of `parts` (its items, and its rest name), if no name is bound twice. */
function arrayOf(
  { items, rest }: { readonly items: readonly Pattern[]; readonly rest: string | undefined },
  text: string,
): Parsed<Pattern> {
  const pattern: Pattern = rest === undefined ? { kind: "array", items } : { kind: "array", items, rest };
  return map(distinctNames(namesOf(pattern), text), () => pattern);
}

/** The items of an array pattern, and the rest name if its last entry is one. */
function arrayItems(
  entries: readonly string[],
  text: string,
  items: readonly Pattern[],
): Parsed<{ readonly items: readonly Pattern[]; readonly rest: string | undefined }> {
  const [entry, ...others] = entries;
  if (entry === undefined) {
    return Right.of({ items, rest: undefined });
  }
  if (!entry.startsWith("...")) {
    return flatMap(patternOf(entry), (pattern) =>
      arrayItems(others, text, [...items, pattern]));
  }
  const name = entry.slice(3)
    .trim();
  if (others.length > 0) {
    return fail(`The rest of an array pattern comes last: "${text}"`);
  }
  if (!IDENTIFIER.test(name) || LITERAL_WORDS.includes(name)) {
    return fail(`The rest of an array pattern needs a name: "${entry}"`);
  }
  return Right.of({ items, rest: name });
}

/** Throws when a name is bound twice: the later binding would replace the earlier. */
function distinctNames(names: readonly string[], text: string): Parsed<void> {
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  return duplicate === undefined
    ? Right.of(undefined)
    : fail(`The name "${duplicate}" is bound twice in "${text}"`);
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
    case "some":
    case "ok":
    case "error":
      return namesOf(pattern.pattern);
    case "as":
      return [...namesOf(pattern.pattern), pattern.name];
    case "regex":
      return [...pattern.names];
    case "alt":
      // Every option binds the same names (see alternatives), so the first one's are the names.
      return namesOf(pattern.options[0]!);
    default:
      return [];
  }
}

/** The pattern of an object field: its key's value, or the key's name when it has none. */
function fieldPattern(key: string, value: string | undefined): Parsed<Pattern> {
  if (value === undefined) {
    return Right.of({ kind: "bind", name: key });
  }
  return value.trim() === "absent" ? Right.of({ kind: "absent" }) : patternOf(value.trim());
}

/** Split at the `separator`s that are not inside braces, brackets, parentheses or quotes. */
function splitTopLevel(text: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  const quotes = new QuoteTracker();
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quotes.step(char)) {
      // A character of a string is never structure.
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

// A regex literal: `/body/flags`. The body is one or more escapes, bracket classes or
// characters other than `/`, `\`, `[` and a line break. So a `/` inside `[...]` or
// after `\` does not end it.
const REGEX_LITERAL = /^\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\[\n])+)\/[A-Za-z]*/;
// A masked literal: its characters as hex, between two private-use marks that no
// pattern token contains.
const MASKED_REGEX = /^\uE000([0-9a-f]+)\uE000$/;
const MASK_MARK = "\uE000";
const MASKED_IN_TEXT = /\uE000([0-9a-f]+)\uE000/g;

/**
 * Whether a `/` at `at` starts a regex literal: only where a pattern can begin, after the
 * start, a bar, an opening bracket, a comma, a colon or `not`. So `a / b` in a guard is division.
 */
function startsRegex(text: string, at: number): boolean {
  const before = text.slice(0, at)
    .trimEnd();
  return before === "" || /[|([{,:]$/.test(before) || /\bnot$/.test(before);
}

/** The [start, end) spans of the regex literals in the text. Quoted strings are skipped. */
function regexSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const quotes = new QuoteTracker();
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quotes.step(char)) {
      // A character of a string is never structure.
    } else if (char === "/" && startsRegex(text, i)) {
      const found = REGEX_LITERAL.exec(text.slice(i));
      if (found) {
        spans.push([i, i + found[0].length]);
        i += found[0].length - 1;
      }
    }
  }
  return spans;
}

/** The text with each regex literal replaced by the same number of `_`, so every index is kept. */
export function blankRegexes(text: string): string {
  let blanked = text;
  for (const [start, end] of regexSpans(text)
    .reverse()) {
    blanked = blanked.slice(0, start) + "_".repeat(end - start) + blanked.slice(end);
  }
  return blanked;
}

/** The text with each regex literal replaced by its masked form, which a pattern token can hold. */
function maskRegexes(text: string): string {
  let masked = text;
  for (const [start, end] of regexSpans(text)
    .reverse()) {
    masked = masked.slice(0, start) + encodeLiteral(text.slice(start, end)) + masked.slice(end);
  }
  return masked;
}

/** A message with its masked literals written back as they were typed. */
function restoreRegexes(message: string): string {
  return message.replace(MASKED_IN_TEXT, (_, hex: string) => decodeLiteral(hex));
}

function encodeLiteral(literal: string): string {
  let hex = "";
  for (let i = 0; i < literal.length; i++) {
    hex += literal.charCodeAt(i)
      .toString(16)
      .padStart(4, "0");
  }
  return `${MASK_MARK}${hex}${MASK_MARK}`;
}

function decodeLiteral(hex: string): string {
  let literal = "";
  for (let i = 0; i < hex.length; i += 4) {
    literal += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
  }
  return literal;
}

/**
 * `/body/flags`: a string matched with the regex. Its named groups are the names it binds,
 * each to the group's text (undefined when the group did not take part). `g` and `y` keep
 * state between matches, so they are refused.
 */
function regexPattern(literal: string): Parsed<Pattern> {
  const close = literal.lastIndexOf("/");
  const source = literal.slice(1, close);
  const flags = literal.slice(close + 1);
  if (/[gy]/.test(flags)) {
    return fail(`A regex pattern cannot have the "g" or "y" flag, since they keep state between matches: "${literal}"`);
  }
  return flatMap(regexNames(source, flags), (names): Parsed<Pattern> => repeatsRepeat(source)
    ? fail(`The regex ${literal} repeats a group that already repeats, as (a+)+ does. It can take `
      + "exponential time on input that almost matches: rewrite it so that each part repeats once, "
      + "for example ^a+$ instead of ^(a+)+$")
    : Right.of({ kind: "regex", source, flags, names }));
}

/**
 * Whether a regex repeats a group that already repeats, as `(a+)+` does, or repeats a group that
 * contains a repeat. Such a group can take exponential time on input that almost matches. A
 * quantifier is `*`, `+`, `{n}`, `{n,}` or `{n,m}`; `?` is an option, not a repeat, and escapes and
 * bracket classes are not groups. The regex has compiled already, so its parentheses balance.
 */
function repeatsRepeat(source: string): boolean {
  // One entry per open group: whether something inside it repeats.
  const open: boolean[] = [];
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === "\\") {
      i += 1;
    } else if (inClass) {
      inClass = char !== "]";
    } else if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      open.push(false);
    } else if (char === ")") {
      const inner = open.pop()!;
      const quantified = quantifierLength(source, i + 1) > 0;
      if (inner && quantified) {
        return true;
      }
      markRepeat(open, inner || quantified);
    } else {
      markRepeat(open, quantifierLength(source, i) > 0);
    }
  }
  return false;
}

/** Records that the innermost open group contains a repeat, if `repeats` and there is one. */
function markRepeat(open: boolean[], repeats: boolean): void {
  if (repeats && open.length > 0) {
    open[open.length - 1] = true;
  }
}

/** The length of the quantifier that starts at `at` (`*`, `+`, `{n}`, `{n,}` or `{n,m}`), or 0. */
function quantifierLength(source: string, at: number): number {
  if (source[at] === "*" || source[at] === "+") {
    return 1;
  }
  const braces = /^\{\d+(?:,\d*)?\}/.exec(source.slice(at));
  return braces === null ? 0 : braces[0].length;
}

/**
 * The named groups of a regex. The engine reports a regex that does not compile only by
 * throwing, so this is the one place that catches: it turns that throw into a Left.
 * A probe with an empty alternative always matches, and its groups list every named group.
 */
function regexNames(source: string, flags: string): Parsed<string[]> {
  try {
    return Right.of(Object.keys(new RegExp(`(?:${source})|`, flags)
      .exec("")!.groups ?? {}));
  } catch (error) {
    return fail(toError(error).message);
  }
}
