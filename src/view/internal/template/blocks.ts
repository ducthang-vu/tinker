// Blocks in templates: `@if`, `@else`, `@else if`, `@match`, `@case`, `@default`
// and `@map`, written in text that the browser's parser keeps as text.
//
//   @if (user()) { <p>Hi</p> } @else if (guest()) { <p>Guest</p> } @else { ... }
//   @match state { @case "loading" { ... } @default { ... } }
//
// This module only finds the blocks: it splits the text into tokens (text,
// elements, a block opening with its keyword and header, a closing brace),
// nests the blocks by their braces, and attaches each `@else` to its `@if`.
// Compiling the blocks into matches is done by compile.ts.
//
// `{{ }}` is skipped when looking for braces, since interpolations contain them.

import type { TemplateNode } from "./ast.ts";

export type BlockKeyword = "if" | "elseif" | "else" | "match" | "case" | "default" | "map";

/** Anything in a template: a node, or a block with its body. */
export type Item = TemplateNode | BlockItem;

export interface BlockItem {
  readonly kind: "block";
  readonly keyword: BlockKeyword;
  /** The text between the keyword and the `{`, trimmed: `(user())`, `"loading"`, or empty. */
  readonly header: string;
  readonly body: readonly Item[];
  /** For an `@if`: what its `@else` or `@else if` gives, when there is one. */
  readonly otherwise?: readonly Item[];
}

type Token
  = | { readonly kind: "node"; readonly node: TemplateNode }
    | { readonly kind: "open"; readonly keyword: BlockKeyword; readonly header: string }
    | { readonly kind: "close" };

const BLOCK_START = /@(else\s+if|if|else|match|case|default|map)(?![\w$])/y;

/** The items of a list of nodes: blocks nested by braces, `@else`s attached to their `@if`. */
export function itemsOf(nodes: readonly TemplateNode[]): readonly Item[] {
  const tokens = nodes.flatMap(tokenize);
  const state = { position: 0 };
  return attachElses(read(tokens, state, false));
}

function tokenize(node: TemplateNode): Token[] {
  if (node.kind === "element") {
    return [{ kind: "node", node }];
  }
  const tokens: Token[] = [];
  let text = "";
  const flush = () => {
    if (text !== "") {
      tokens.push({ kind: "node", node: { kind: "text", value: text } });
      text = "";
    }
  };
  let i = 0;
  while (i < node.value.length) {
    if (node.value.startsWith("{{", i)) {
      const end = node.value.indexOf("}}", i + 2);
      const stop = end === -1 ? node.value.length : end + 2;
      text += node.value.slice(i, stop);
      i = stop;
      continue;
    }
    BLOCK_START.lastIndex = i;
    const start = BLOCK_START.exec(node.value);
    if (start) {
      flush();
      const keyword = start[1]!.replace(/\s+/, "") as BlockKeyword;
      const brace = bodyBrace(node.value, BLOCK_START.lastIndex, keyword);
      if (brace === -1) {
        throw new Error(`Missing "{" after "${start[0]}"`);
      }
      tokens.push({ kind: "open", keyword, header: node.value.slice(BLOCK_START.lastIndex, brace)
        .trim() });
      i = brace + 1;
      continue;
    }
    if (node.value[i] === "}") {
      flush();
      tokens.push({ kind: "close" });
    } else {
      text += node.value[i];
    }
    i++;
  }
  flush();
  return tokens;
}

/**
 * The `{` that opens a block's body. A `@case` may start with an object pattern,
 * which has braces of its own: the body is the first `{` after that pattern.
 */
function bodyBrace(value: string, from: number, keyword: BlockKeyword): number {
  if (keyword === "map") {
    return mapBodyBrace(value, from);
  }
  let start = from;
  if (keyword === "case") {
    while (start < value.length && /\s/.test(value[start]!)) {
      start++;
    }
    if (value[start] === "{" || value[start] === "[") {
      start = matchingBrace(value, start) + 1;
    }
  }
  return value.indexOf("{", start);
}

/**
 * The body of a `@map`: the first `{` that does not open a pattern. A pattern is
 * a `{` or `[` right after `let` or `track` (`let { id }`, `track { id }`), and
 * it is skipped with its contents.
 */
function mapBodyBrace(value: string, from: number): number {
  let search = from;
  for (;;) {
    const open = value.slice(search)
      .search(/[{[]/);
    if (open === -1) {
      return -1;
    }
    const at = search + open;
    if (/(?:^|;)\s*(?:let|track)\s*$/.test(value.slice(from, at))) {
      search = matchingBrace(value, at) + 1;
    } else if (value[at] === "{") {
      return at;
    } else {
      search = at + 1;
    }
  }
}

/**
 * The index of the bracket that closes the `{` or `[` at `open`, skipping quoted
 * text. Only brackets of the same kind are counted.
 */
function matchingBrace(value: string, open: number): number {
  const opener = value[open]!;
  const closer = opener === "[" ? "]" : "}";
  let depth = 0;
  let quote: string | undefined;
  for (let i = open; i < value.length; i++) {
    const char = value[i]!;
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === opener) {
      depth++;
    } else if (char === closer) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error(`Missing "${closer}" in the pattern`);
}

/** Read items until the end of the tokens, or, inside a block, its closing brace. */
function read(tokens: readonly Token[], state: { position: number }, inBlock: boolean): Item[] {
  const items: Item[] = [];
  while (state.position < tokens.length) {
    const token = tokens[state.position++]!;
    if (token.kind === "node") {
      items.push(token.node);
    } else if (token.kind === "open") {
      const body = attachElses(read(tokens, state, true));
      items.push({ kind: "block", keyword: token.keyword, header: token.header, body });
    } else {
      if (!inBlock) {
        throw new Error(`Unexpected "}" with no block to close`);
      }
      return items;
    }
  }
  if (inBlock) {
    throw new Error(`Missing "}" to close a block`);
  }
  return items;
}

/**
 * Attach each `@else` and `@else if` to the `@if` before it. The `@if`s that
 * have no `@else` are kept as they are.
 */
function attachElses(items: readonly Item[]): Item[] {
  const result: Item[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    if (isBlock(item) && item.keyword === "if") {
      const chain = ifChain(items, i);
      result.push(chain.item);
      i = chain.end;
    } else {
      result.push(item);
      i++;
    }
  }
  return result;
}

/**
 * The `@if` at `index`, with the `@else` or `@else if` after it attached (an
 * `@else if` carries the rest of its chain). `end` is the index after the chain.
 */
function ifChain(items: readonly Item[], index: number): { item: BlockItem; end: number } {
  const item = items[index] as BlockItem;
  const next = nextSignificant(items, index + 1);
  const following = next === undefined ? undefined : items[next];
  if (!following || !isBlock(following)) {
    return { item, end: index + 1 };
  }
  if (following.keyword === "else") {
    return { item: { ...item, otherwise: attachElses(following.body) }, end: next! + 1 };
  }
  if (following.keyword === "elseif") {
    // The `@else if` is read as an `@if` of its own, so its own `@else` is attached too.
    const asIf = items.map((candidate, at) => (at === next ? { ...following, keyword: "if" as const } : candidate));
    const chain = ifChain(asIf, next!);
    return { item: { ...item, otherwise: [chain.item] }, end: chain.end };
  }
  return { item, end: index + 1 };
}

/** The index of the next item that is not whitespace-only text, from `from`. */
function nextSignificant(items: readonly Item[], from: number): number | undefined {
  for (let i = from; i < items.length; i++) {
    const item = items[i]!;
    if (isBlock(item) || item.kind === "element" || item.value.trim() !== "") {
      return i;
    }
  }
  return undefined;
}

function isBlock(item: Item): item is BlockItem {
  return "keyword" in item;
}
