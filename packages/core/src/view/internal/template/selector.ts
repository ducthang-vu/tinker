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
//
// `:not(...)` holds a simple selector (no tag-less `:not` inside it, and no
// nested `:not`) or a comma list of them: the element matches when it matches
// none. Names are compared case-insensitively: the browser's parser lowercases
// tag and attribute names. Top-level lists (`"[a], [b]"`) are not supported yet.

import { Either, type EitherError } from "@tinker/functional";
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

export class Selector {
  private constructor(
    /** The source, for error messages. */
    readonly source: string,
    private readonly tag: string | undefined,
    private readonly attributes: readonly AttributeCondition[],
    private readonly classes: readonly string[],
    /** The selectors from `:not(...)`: the element must match none of them. */
    private readonly negations: readonly Selector[],
  ) {}

  /** Parse `source`, or the error explaining what is not supported. */
  static parse(source: string): EitherError<Selector> {
    return Either.from(() => Selector.parseOrThrow(source));
  }

  /**
   * Whether `element` matches: its tag, every attribute and class required, and
   * none of the `:not(...)` selectors matching it.
   */
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

  private static parseOrThrow(source: string): Selector {
    let rest = source.trim();
    if (rest === "") {
      throw new Error(`Empty selector: write e.g. "[tooltip]" or "tk-card"`);
    }
    const tag = TAG.exec(rest)?.[0];
    rest = rest.slice(tag?.length ?? 0);
    const attributes: AttributeCondition[] = [];
    const classes: string[] = [];
    const negations: Selector[] = [];
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
        negations.push(...Selector.parseNegation(source, negation[1]!));
        rest = rest.slice(negation[0].length);
      } else if (rest.startsWith(",")) {
        throw new Error(`Selector lists are not supported yet: "${source}"`);
      } else {
        throw new Error(
          `Unsupported selector "${source}" at "${rest}": `
          + "write a tag, [attr], [attr=value], .class or :not(...)",
        );
      }
    }
    return new Selector(source, tag?.toLowerCase(), attributes, classes, negations);
  }

  /** The selectors of a `:not(...)` body: a comma list, each part a simple selector. */
  private static parseNegation(source: string, body: string): Selector[] {
    return body.split(",")
      .map((part) => {
        if (part.trim() === "") {
          throw new Error(
            `Empty part in ":not(${body})" of "${source}": write e.g. ":not([disabled])"`,
          );
        }
        return Selector.parseOrThrow(part);
      });
  }
}
