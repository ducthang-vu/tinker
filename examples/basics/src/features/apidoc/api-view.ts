// What the API page shows, computed from the reference: TSDoc text becomes paragraphs and code
// blocks, and each entry point becomes a section of documented items. The functions are pure,
// so they are tested without a page.

import type { ApiDoc, ApiEntry, ApiExport, ApiParam, ApiReference } from "./api-reference.ts";

/** A run of text in a paragraph: plain, or a `code span`. */
export interface TextPart {
  readonly text: string;
  readonly code: boolean;
}

/** A paragraph (`isCode` false, its `parts`) or a fenced code block (`isCode` true, its `text`). */
export interface DocBlock {
  readonly isCode: boolean;
  readonly text: string;
  readonly parts: readonly TextPart[];
}

/** A documented thing, ready to show. Empty strings and empty lists mean "not present". */
export interface ViewDoc {
  readonly name: string;
  readonly kind: string;
  readonly source: string;
  readonly static: boolean;
  readonly final: boolean;
  readonly deprecated: string;
  readonly signatures: readonly string[];
  readonly type: string;
  readonly declaration: string;
  readonly description: readonly DocBlock[];
  readonly params: readonly ApiParam[];
  readonly returns: string;
  readonly examples: readonly DocBlock[];
  readonly see: readonly string[];
  readonly throws: readonly string[];
}

export interface ViewItem extends ViewDoc {
  readonly id: string;
  /** The link to the item: its id, as a fragment. */
  readonly href: string;
  readonly members: readonly ViewDoc[];
  readonly hasMembers: boolean;
}

export interface ViewSection {
  readonly id: string;
  readonly href: string;
  readonly specifier: string;
  readonly items: readonly ViewItem[];
  readonly hasItems: boolean;
}

/**
 * Splits TSDoc text into blocks. A line starting with ``` opens or closes a code block, kept as
 * written; other lines form paragraphs, split at blank lines, with `backtick` spans marked.
 */
export function docBlocks(text: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let paragraph: string[] = [];
  let code: string[] | undefined;

  const endParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(textBlock(paragraph.join(" ")));
      paragraph = [];
    }
  };

  for (const line of text.split("\n")) {
    if (line.trimStart()
      .startsWith("```")) {
      if (code === undefined) {
        endParagraph();
        code = [];
      } else {
        blocks.push(codeBlock(code.join("\n")));
        code = undefined;
      }
    } else if (code !== undefined) {
      code.push(line);
    } else if (line.trim() === "") {
      endParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  if (code !== undefined) {
    blocks.push(codeBlock(code.join("\n")));
  }
  return blocks;
}

function codeBlock(text: string): DocBlock {
  return { isCode: true, text, parts: [] };
}

function textBlock(text: string): DocBlock {
  // Odd pieces of the split are between a pair of backticks: they are code.
  const parts = text.split("`")
    .map((piece, index): TextPart => ({ text: piece, code: index % 2 === 1 }))
    .filter((part) => part.text !== "");
  return { isCode: false, text: "", parts };
}

/**
 * An id for an anchor link: each run of characters other than letters, digits and "_" is one dash.
 * The case is kept, so `MAP` and `map` stay two ids.
 */
export function anchorId(...segments: readonly string[]): string {
  return segments.join("-")
    .replace(/[^A-Za-z0-9_]+/g, "-")
    .replace(/^-|-$/g, "");
}

function viewDoc(doc: ApiDoc): ViewDoc {
  return {
    name: doc.name,
    kind: doc.kind,
    source: doc.source,
    static: doc.static === true,
    final: doc.final === true,
    // A deprecation with no text still says so.
    deprecated: doc.deprecated === undefined ? "" : doc.deprecated || "Deprecated.",
    signatures: doc.signatures ?? [],
    type: doc.type ?? "",
    declaration: doc.declaration ?? "",
    description: docBlocks(doc.description),
    params: doc.params,
    returns: doc.returns ?? "",
    examples: doc.examples.flatMap((example) => docBlocks(example)),
    see: doc.see,
    throws: doc.throws,
  };
}

function viewItem(item: ApiExport, specifier: string): ViewItem {
  const members = (item.members ?? []).map(viewDoc);
  return {
    ...viewDoc(item),
    id: anchorId(specifier, item.name),
    href: `#${anchorId(specifier, item.name)}`,
    members,
    hasMembers: members.length > 0,
  };
}

function viewSection(entry: ApiEntry): ViewSection {
  const items = entry.exports.map((item) => viewItem(item, entry.specifier));
  return {
    id: anchorId(entry.specifier),
    href: `#${anchorId(entry.specifier)}`,
    specifier: entry.specifier,
    items,
    hasItems: items.length > 0,
  };
}

/** The page's sections, one per entry point, in the order the reference lists them. */
export function toSections(reference: ApiReference): ViewSection[] {
  return reference.entries.map(viewSection);
}
