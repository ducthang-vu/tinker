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

import { Either } from "@tinker/functional";
import { eachOf } from "../../../utils/each-of.ts";

/** A selector that is not supported: what is wrong with it. */
export class SelectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectorError";
  }
}
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
  static parse(source: string): Either<Selector, SelectorError> {
    if (source.trim() === "") {
      return Either.left(new SelectorError(`Empty selector: write e.g. "[tooltip]" or "tk-card"`));
    }
    const parts = splitList(source);
    if (parts.some((part) => part.trim() === "")) {
      return Either.left(new SelectorError(
        `Empty part in selector list "${source}": write e.g. "[tooltip], tk-card"`,
      ));
    }
    return Either.map(
      eachOf(parts, (part) => Compound.parse(part, source)),
      (alternatives) => new Selector(source, alternatives),
    );
  }

  /** Whether `element` matches any of the selectors of the list. */
  matches(element: SelectableElement): boolean {
    return this.alternatives.some((alternative) => alternative.matches(element));
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

/** The conditions of one selector, gathered while its source is read. */
interface CompoundParts {
  readonly tag: string | undefined;
  readonly attributes: readonly AttributeCondition[];
  readonly classes: readonly string[];
  readonly negations: readonly Compound[];
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
  static parse(part: string, source: string): Either<Compound, SelectorError> {
    const rest = part.trim();
    const tag = TAG.exec(rest)?.[0];
    return Either.map(
      Compound.parseParts(
        rest.slice(tag?.length ?? 0),
        { tag, attributes: [], classes: [], negations: [] },
        source,
      ),
      (parts) => new Compound(
        parts.tag?.toLowerCase(),
        parts.attributes,
        parts.classes,
        parts.negations,
      ),
    );
  }

  /** The conditions left in `rest`, each read onto the `parts` gathered so far. */
  private static parseParts(
    rest: string,
    parts: CompoundParts,
    source: string,
  ): Either<CompoundParts, SelectorError> {
    if (rest === "") {
      return Either.right(parts);
    }
    const attribute = ATTRIBUTE.exec(rest);
    const className = CLASS.exec(rest);
    const negation = NOT.exec(rest);
    if (attribute) {
      const value = attribute[2] ?? attribute[3] ?? attribute[4];
      const name = attribute[1]!.toLowerCase();
      const condition = { name, ...(value !== undefined && { value }) };
      return Compound.parseParts(rest.slice(attribute[0].length), {
        ...parts,
        attributes: [...parts.attributes, condition],
      }, source);
    }
    if (className) {
      return Compound.parseParts(rest.slice(className[0].length), {
        ...parts,
        classes: [...parts.classes, className[1]!],
      }, source);
    }
    if (negation) {
      return Either.flatMap(Compound.parseNegation(source, negation[1]!), (negated) =>
        Compound.parseParts(rest.slice(negation[0].length), {
          ...parts,
          negations: [...parts.negations, ...negated],
        }, source));
    }
    return Either.left(new SelectorError(
      `Unsupported selector "${source}" at "${rest}": `
      + "write a tag, [attr], [attr=value], .class or :not(...)",
    ));
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
  private static parseNegation(
    source: string,
    body: string,
  ): Either<readonly Compound[], SelectorError> {
    return eachOf(body.split(","), (part) => (part.trim() === ""
      ? Either.left(new SelectorError(`Empty part in ":not(${body})" of "${source}": write e.g. ":not([disabled])"`))
      : Compound.parse(part, source)));
  }
}
