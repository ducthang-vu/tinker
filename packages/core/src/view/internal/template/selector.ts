// Selectors: which elements a directive applies to, e.g. `"[tooltip]"`.
//
// A subset of CSS, for one element (no combinators, like Angular):
//
//   tag                  button, tk-card
//   [attr]               [tooltip]
//   [attr=value]         [type=submit], [type="submit"]
//   .class               .primary
//   :not(...)            button:not([disabled]), div:not(.a, .b)
//   and combinations:    button[tooltip].primary
//   lists:               button, [tooltip].primary, a:not(.x)
//
// A list matches when any of its selectors does. `:not(...)` holds simple
// selectors (no nested `:not`) or a comma list of them: the element matches
// when it matches none. Names are compared case-insensitively: the browser's
// parser lowercases tag and attribute names.

import { Either, toError, type EitherError } from "@tinker/functional";
import type { AttributeNode } from "./ast.ts";

/** What a selector is matched against: an element of a parsed template. */
export interface SelectableElement {
  readonly name: string;
  readonly attributes: readonly AttributeNode[];
}

interface AttributeCondition {
  readonly name: string;
  /** The required value; any value if absent. */
  readonly value?: string;
}

const TAG = /^[a-zA-Z][\w-]*/;
const ATTRIBUTE = /^\[\s*([^\s\]=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*)?\]/;
const CLASS = /^\.([\w-]+)/;
const NOT = /^:not\(([^()]*)\)/;

/** A selector list, as written: it matches an element that any of its selectors matches. */
export class Selector {
  private constructor(
    /** The source, for error messages. */
    readonly source: string,
    private readonly alternatives: readonly Compound[],
  ) {}

  /** Parse `source`, or the error explaining what is not supported. */
  static parse(source: string): EitherError<Selector> {
    return Either.try(() => Selector.parseOrThrow(source))
      .mapLeft(toError);
  }

  /** Whether `element` matches any of the selectors of the list. */
  matches(element: SelectableElement): boolean {
    return this.alternatives.some((alternative) => alternative.matches(element));
  }

  private static parseOrThrow(source: string): Selector {
    if (source.trim() === "") {
      throw new Error(`Empty selector: write e.g. "[tooltip]" or "tk-card"`);
    }
    const parts = splitList(source);
    if (parts.some((part) => part.trim() === "")) {
      throw new Error(`Empty part in selector list "${source}": write e.g. "[tooltip], tk-card"`);
    }
    return new Selector(source, parts.map((part) => Compound.parse(part, source)));
  }
}

/** Splits `source` at its commas, except those inside quotes or parentheses. */
function splitList(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quote !== undefined) {
      quote = char === quote ? undefined : quote;
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

/** One selector of a list: a tag, attributes, classes and `:not(...)`s, all required. */
class Compound {
  private constructor(
    private readonly tag: string | undefined,
    private readonly attributes: readonly AttributeCondition[],
    private readonly classes: readonly string[],
    /** The selectors from `:not(...)`: the element must match none of them. */
    private readonly negations: readonly Compound[],
  ) {}

  /** Parse one selector of the list `source`, for error messages. `part` is not empty. */
  static parse(part: string, source: string): Compound {
    let rest = part.trim();
    const tag = TAG.exec(rest)?.[0];
    rest = rest.slice(tag?.length ?? 0);
    const attributes: AttributeCondition[] = [];
    const classes: string[] = [];
    const negations: Compound[] = [];
    while (rest !== "") {
      const attribute = ATTRIBUTE.exec(rest);
      const className = CLASS.exec(rest);
      const negation = NOT.exec(rest);
      if (attribute) {
        const value = attribute[2] ?? attribute[3] ?? attribute[4];
        const name = attribute[1]!.toLowerCase();
        attributes.push({ name, ...(value !== undefined && { value }) });
        rest = rest.slice(attribute[0].length);
      } else if (className) {
        classes.push(className[1]!);
        rest = rest.slice(className[0].length);
      } else if (negation) {
        negations.push(...Compound.parseNegation(source, negation[1]!));
        rest = rest.slice(negation[0].length);
      } else {
        throw new Error(
          `Unsupported selector "${source}" at "${rest}": `
          + "write a tag, [attr], [attr=value], .class or :not(...)",
        );
      }
    }
    return new Compound(tag?.toLowerCase(), attributes, classes, negations);
  }

  /** Whether `element` matches: its tag, every attribute and class, and no negation. */
  matches(element: SelectableElement): boolean {
    const attributes = new Map(element.attributes.map((a) => [a.name.toLowerCase(), a.value]));
    const classes = new Set((attributes.get("class") ?? "").split(/\s+/)
      .filter(Boolean));
    return (
      (this.tag === undefined || this.tag === element.name.toLowerCase())
      && this.attributes.every(({ name, value }) =>
        attributes.has(name) && (value === undefined || attributes.get(name) === value))
      && this.classes.every((name) => classes.has(name))
      && this.negations.every((negation) => !negation.matches(element))
    );
  }

  /** The selectors of a `:not(...)` body: a comma list, each part a simple selector. */
  private static parseNegation(source: string, body: string): Compound[] {
    return body.split(",")
      .map((part) => {
        if (part.trim() === "") {
          throw new Error(
            `Empty part in ":not(${body})" of "${source}": write e.g. ":not([disabled])"`,
          );
        }
        return Compound.parse(part, source);
      });
  }
}
