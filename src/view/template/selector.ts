// Selectors: which elements a directive applies to, e.g. `"[tooltip]"`.
//
// A subset of CSS, for one element (no combinators, like Angular):
//
//   tag                  button, tk-card
//   [attr]               [tooltip]
//   [attr=value]         [type=submit], [type="submit"]
//   .class               .primary
//   and combinations:    button[tooltip].primary
//
// Names are compared case-insensitively: the browser's parser lowercases
// tag and attribute names. Lists (`"[a], [b]"`) are not supported yet.

import { Either, type EitherError } from "../../functional/index.ts";
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

export class Selector {
  private constructor(
    /** The source, for error messages. */
    readonly source: string,
    private readonly tag: string | undefined,
    private readonly attributes: readonly AttributeCondition[],
    private readonly classes: readonly string[],
  ) {}

  /** Parse `source`, or the error explaining what is not supported. */
  static parse(source: string): EitherError<Selector> {
    return Either.tryCatchError(() => Selector.parseOrThrow(source));
  }

  /** Whether `element` matches: its tag, and every attribute and class required. */
  matches(element: SelectableElement): boolean {
    const attributes = new Map(element.attributes.map((a) => [a.name.toLowerCase(), a.value]));
    const classes = new Set((attributes.get("class") ?? "").split(/\s+/)
      .filter(Boolean));
    return (
      (this.tag === undefined || this.tag === element.name.toLowerCase())
      && this.attributes.every(({ name, value }) =>
        attributes.has(name) && (value === undefined || attributes.get(name) === value))
      && this.classes.every((name) => classes.has(name))
    );
  }

  private static parseOrThrow(source: string): Selector {
    let rest = source.trim();
    if (rest === "") {
      throw new Error(`Empty selector: write e.g. "[tooltip]" or "tk-card"`);
    }
    if (rest.includes(",")) {
      throw new Error(`Selector lists are not supported yet: "${source}"`);
    }
    const tag = TAG.exec(rest)?.[0];
    rest = rest.slice(tag?.length ?? 0);
    const attributes: AttributeCondition[] = [];
    const classes: string[] = [];
    while (rest !== "") {
      const attribute = ATTRIBUTE.exec(rest);
      const className = CLASS.exec(rest);
      if (attribute) {
        const value = attribute[2] ?? attribute[3] ?? attribute[4];
        const name = attribute[1]!.toLowerCase();
        attributes.push({ name, ...(value !== undefined && { value }) });
        rest = rest.slice(attribute[0].length);
      } else if (className) {
        classes.push(className[1]!);
        rest = rest.slice(className[0].length);
      } else {
        throw new Error(
          `Unsupported selector "${source}" at "${rest}": write a tag, [attr], [attr=value] or .class`,
        );
      }
    }
    return new Selector(source, tag?.toLowerCase(), attributes, classes);
  }
}
