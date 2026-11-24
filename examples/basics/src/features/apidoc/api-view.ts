// What the API page shows, computed from the reference: TSDoc text becomes paragraphs and code
// blocks, and each entry point becomes a section of documented items. The functions are pure,
// so they are tested without a page.

import type { ApiDoc, ApiEntry, ApiExport, ApiOverload, ApiParam, ApiReference } from "./api-reference.ts";

/** A run of text in a paragraph: plain, a `code span`, or a link (its `href`, else ""). */
export interface TextPart {
  readonly text: string;
  readonly code: boolean;
  readonly href: string;
}

/**
 * A paragraph (`isCode` and `isList` false, its `parts`), a list (`isList`, its `items`, each a
 * list of parts) or a fenced code block (`isCode` true, its `text`).
 */
export interface DocBlock {
  readonly isCode: boolean;
  readonly isList: boolean;
  readonly text: string;
  readonly parts: readonly TextPart[];
  readonly items: readonly (readonly TextPart[])[];
}

/** A documented thing, ready to show. Empty strings and empty lists mean "not present". */
/** One overload, as the view shows it. */
export interface ViewOverload {
  readonly declaration: string;
  readonly description: readonly DocBlock[];
  readonly params: readonly ApiParam[];
  readonly returns: string;
  readonly examples: readonly DocBlock[];
}

export interface ViewDoc {
  readonly name: string;
  readonly kind: string;
  readonly source: string;
  readonly static: boolean;
  /** The base class a member is inherited from, or "" when the item declares it. */
  readonly inheritedFrom: string;
  readonly final: boolean;
  readonly deprecated: string;
  readonly signatures: readonly string[];
  /** Each overload of a function or method, with its own doc; none for a single signature. */
  readonly overloads: readonly ViewOverload[];
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
export function docBlocks(
  text: string,
  links: ReadonlyMap<string, string> = new Map(),
): DocBlock[] {
  const blocks: DocBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | undefined;

  const endParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(textBlock(paragraph.join(" "), links));
      paragraph = [];
    }
  };
  const endList = (): void => {
    if (list.length > 0) {
      blocks.push(listBlock(list, links));
      list = [];
    }
  };

  for (const line of text.split("\n")) {
    if (line.trimStart()
      .startsWith("```")) {
      endParagraph();
      endList();
      if (code === undefined) {
        code = [];
      } else {
        blocks.push(codeBlock(code.join("\n")));
        code = undefined;
      }
    } else if (code !== undefined) {
      code.push(line);
    } else if (line.trim() === "") {
      endParagraph();
      endList();
    } else if (LIST_ITEM.test(line.trim())) {
      endParagraph();
      list.push(line.trim()
        .replace(LIST_ITEM, ""));
    } else {
      endList();
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  endList();
  if (code !== undefined) {
    blocks.push(codeBlock(code.join("\n")));
  }
  return blocks;
}

/** A line of a list: `- item`, or `* item`. */
const LIST_ITEM = /^[-*] /;
/** An inline tag `{@link Name}`, or a Markdown link `[text](url)`: its text, then its target. */
const INLINE_LINK = /\{@link\s+([^}\s]+)\s*\}|\[([^\]]+)\]\(([^)\s]+)\)/g;

function codeBlock(text: string): DocBlock {
  return { isCode: true, isList: false, text, parts: [], items: [] };
}

function textBlock(text: string, links: ReadonlyMap<string, string>): DocBlock {
  return { isCode: false, isList: false, text: "", parts: partsOf(text, links), items: [] };
}

function listBlock(items: readonly string[], links: ReadonlyMap<string, string>): DocBlock {
  return {
    isCode: false,
    isList: true,
    text: "",
    parts: [],
    items: items.map((item) => partsOf(item, links)),
  };
}

/**
 * The parts of a line of text. Odd pieces of a backtick split are code spans; the rest holds
 * the links, which `links` resolves for `{@link Name}` (none, when the name is not exported).
 */
function partsOf(text: string, links: ReadonlyMap<string, string>): TextPart[] {
  return text.split("`")
    .flatMap((piece, index): TextPart[] => index % 2 === 1
      ? [{ text: piece, code: true, href: "" }]
      : linksIn(piece, links))
    .filter((part) => part.text !== "");
}

function linksIn(text: string, links: ReadonlyMap<string, string>): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_LINK)) {
    parts.push(plainPart(text.slice(last, match.index)));
    last = match.index + match[0].length;
    parts.push(match[1] === undefined
      ? { text: match[2]!, code: false, href: match[3]! }
      : { text: match[1], code: false, href: links.get(match[1]) ?? "" });
  }
  parts.push(plainPart(text.slice(last)));
  return parts;
}

function plainPart(text: string): TextPart {
  return { text, code: false, href: "" };
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

function viewOverload(overload: ApiOverload, links: ReadonlyMap<string, string>): ViewOverload {
  return {
    declaration: overload.declaration,
    description: docBlocks(overload.description, links),
    params: overload.params,
    returns: overload.returns ?? "",
    examples: overload.examples.flatMap((example) => docBlocks(example, links)),
  };
}

function viewDoc(doc: ApiDoc, links: ReadonlyMap<string, string>): ViewDoc {
  return {
    name: doc.name,
    kind: doc.kind,
    source: doc.source,
    static: doc.static === true,
    inheritedFrom: doc.inheritedFrom ?? "",
    final: doc.final === true,
    // A deprecation with no text still says so.
    deprecated: doc.deprecated === undefined ? "" : doc.deprecated || "Deprecated.",
    // An overloaded function shows its overloads instead of its signatures, which repeat them.
    signatures: doc.overloads === undefined ? doc.signatures ?? [] : [],
    overloads: (doc.overloads ?? []).map((overload: ApiOverload) => viewOverload(overload, links)),
    type: doc.type ?? "",
    declaration: doc.declaration ?? "",
    description: docBlocks(doc.description, links),
    params: doc.params,
    returns: doc.returns ?? "",
    examples: doc.examples.flatMap((example) => docBlocks(example, links)),
    see: doc.see,
    throws: doc.throws,
  };
}

function viewItem(
  item: ApiExport,
  specifier: string,
  links: ReadonlyMap<string, string>,
): ViewItem {
  const members = (item.members ?? []).map((member) => viewDoc(member, links));
  return {
    ...viewDoc(item, links),
    id: anchorId(specifier, item.name),
    href: `#${anchorId(specifier, item.name)}`,
    members,
    hasMembers: members.length > 0,
  };
}

function viewSection(entry: ApiEntry, links: ReadonlyMap<string, string>): ViewSection {
  const items = entry.exports.map((item) => viewItem(item, entry.specifier, links));
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
  // `{@link Name}` goes to the anchor of the export it names, wherever that export is.
  const links = new Map<string, string>();
  for (const entry of reference.entries) {
    for (const item of entry.exports) {
      links.set(item.name, `#${anchorId(entry.specifier, item.name)}`);
    }
  }
  return reference.entries.map((entry) => viewSection(entry, links));
}
