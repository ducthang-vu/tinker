// Interpolation: text with `{{ }}`, split into its static strings and the
// expressions between them.
//
//   "Count: {{ count() }}!"  →  strings ["Count: ", "!"], expressions [count()]
//
// There is always one more string than expressions, so the text is
// strings[0] + value(expressions[0]) + strings[1] + ... A text without
// `{{` has one string and no expressions.

import { type Expression, ExpressionParser } from "./expression.ts";
import { Left, map, sequence, type Either } from "@tinker/functional/v1";

export interface Interpolation {
  readonly strings: readonly string[];
  readonly expressions: readonly Expression[];
}

/** Split `text` into strings and parsed expressions, or the first error found. */
export function parseInterpolation(text: string): Either<Interpolation, Error> {
  const strings: string[] = [];
  const sources: string[] = [];
  let rest = text;
  for (let start = rest.indexOf("{{"); start !== -1; start = rest.indexOf("{{")) {
    const end = rest.indexOf("}}", start + 2);
    if (end === -1) {
      return Left.of(new Error(`Unclosed "{{" in "${text}"`));
    }
    strings.push(rest.slice(0, start));
    sources.push(rest.slice(start + 2, end));
    rest = rest.slice(end + 2);
  }
  strings.push(rest);
  const parsed = sequence(sources.map((source) => ExpressionParser.parse(source)));
  return map(parsed, (expressions) => ({ strings, expressions }));
}
