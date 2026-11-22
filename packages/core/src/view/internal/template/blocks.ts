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

import type { Span, TemplateNode, TextNode } from "./ast.ts";
import { compileError, located, type Parsed } from "./compile-error.ts";
import { blankRegexes, QuoteTracker } from "./pattern.ts";
import { flatMap, Left, map, match, mapLeft, Right, sequence } from "@tinker/functional";

export type BlockKeyword = "if" | "elseif" | "else" | "match" | "case" | "default" | "map";

/** Anything in a template: a node, or a block with its body. */
export type Item = TemplateNode | BlockItem;

export interface BlockItem {
  readonly kind: "block";
  readonly keyword: BlockKeyword;
  /** The text between the keyword and the `{`, trimmed: `(user())`, `"loading"`, or empty. */
  readonly header: string;
  /** From the keyword to the closing brace. Set by the parser; absent in a tree built by hand. */
  readonly span?: Span;
  readonly body: readonly Item[];
  /** For an `@if`: what its `@else` or `@else if` gives, when there is one. */
  readonly otherwise?: readonly Item[];
}

type Token
  = | { readonly kind: "node"; readonly node: TemplateNode }
    | { readonly kind: "open"; readonly keyword: BlockKeyword; readonly header: string; readonly span: Span | undefined }
    | { readonly kind: "close"; readonly span: Span | undefined };

const BLOCK_START = /@(else\s+if|if|else|match|case|default|map)(?![\w$])/y;

/**
 * Where the body of the block whose header starts at `at` in `source` opens: the `{` after
 * the header. The header may hold text that looks like markup (a `<` in a `@case` pattern),
 * so the HTML reader needs to know where it ends. Undefined when no block header starts at
 * `at`, or when its body has no `{`, or its pattern is not closed.
 */
export function blockBodyBrace(source: string, at: number): number | undefined {
  BLOCK_START.lastIndex = at;
  const start = BLOCK_START.exec(source);
  if (start === null) {
    return undefined;
  }
  const keyword = start[1]!.replace(/\s+/, "") as BlockKeyword;
  return match<number | undefined, Error, number | undefined>(
    bodyBrace(source, BLOCK_START.lastIndex, keyword),
    {
      Left: () => undefined,
      Right: (brace) => (brace === -1 ? undefined : brace),
    },
  );
}

/** The items of a list of nodes: blocks nested by braces, `@else`s attached to their `@if`. */
export function itemsOf(nodes: readonly TemplateNode[]): Parsed<readonly Item[]> {
  return flatMap(tokensOf(nodes), (tokens) => itemsOfTokens(tokens));
}

/** The items of the tokens, with each `@else` attached to its `@if`. */
function itemsOfTokens(tokens: readonly Token[]): Parsed<readonly Item[]> {
  return map(read(tokens, { position: 0, closed: undefined }, undefined), attachElses);
}

/** The tokens of every node, in order: the first failure stops the rest. */
function tokensOf(nodes: readonly TemplateNode[]): Parsed<Token[]> {
  return map(sequence(nodes.map(tokenize)), (lists) => lists.flat());
}

/** Where the reading of the tokens is: the next token, and the span of the last closing brace. */
interface ReadState {
  position: number;
  closed: Span | undefined;
}

function tokenize(node: TemplateNode): Parsed<Token[]> {
  if (node.kind === "element") {
    return Right.of([{ kind: "node", node }]);
  }
  const tokens: Token[] = [];
  // The text being collected, and the offset (in the text node's value) where it starts.
  let text = "";
  let segment = 0;
  const append = (chunk: string, from: number) => {
    if (text === "") {
      segment = from;
    }
    text += chunk;
  };
  // Pushes the collected text, which runs up to offset `end`.
  const flush = (end: number) => {
    if (text !== "") {
      const span = spanWithin(node, segment, end);
      tokens.push({ kind: "node", node: { kind: "text", value: text, span } });
      text = "";
    }
  };
  let i = 0;
  while (i < node.value.length) {
    if (node.value.startsWith("{{", i)) {
      const end = node.value.indexOf("}}", i + 2);
      const stop = end === -1 ? node.value.length : end + 2;
      append(node.value.slice(i, stop), i);
      i = stop;
      continue;
    }
    BLOCK_START.lastIndex = i;
    const start = BLOCK_START.exec(node.value);
    if (start) {
      flush(i);
      const keyword = start[1]!.replace(/\s+/, "") as BlockKeyword;
      const keywordSpan = spanWithin(node, i, i + start[0].length);
      const brace = match<number, Error, { error: Error } | { at: number }>(
        mapLeft(bodyBrace(node.value, BLOCK_START.lastIndex, keyword), (error) =>
          located(error, keywordSpan)),
        { Left: (error) => ({ error }), Right: (at) => ({ at }) },
      );
      if ("error" in brace) {
        return Left.of(brace.error);
      }
      if (brace.at === -1) {
        return Left.of(compileError(`Missing "{" after "${start[0]}"`, keywordSpan));
      }
      tokens.push({
        kind: "open",
        keyword,
        header: node.value.slice(BLOCK_START.lastIndex, brace.at)
          .trim(),
        span: spanWithin(node, i, brace.at + 1),
      });
      i = brace.at + 1;
      continue;
    }
    if (node.value[i] === "}") {
      flush(i);
      tokens.push({ kind: "close", span: spanWithin(node, i, i + 1) });
    } else {
      append(node.value[i]!, i);
    }
    i++;
  }
  flush(node.value.length);
  return Right.of(tokens);
}

/** The span of `from` to `to` in a text node's value, given the node's own span (if it has one). */
function spanWithin(node: TextNode, from: number, to: number): Span | undefined {
  if (node.span === undefined) {
    return undefined;
  }
  return { start: node.span.start + from, end: node.span.start + to };
}

/**
 * The `{` that opens a block's body. A `@case` may start with an object pattern,
 * which has braces of its own: the body is the first `{` after that pattern.
 */
function bodyBrace(value: string, from: number, keyword: BlockKeyword): Parsed<number> {
  if (keyword === "map") {
    return mapBodyBrace(value, from);
  }
  if (keyword === "case") {
    return caseBodyBrace(value, from);
  }
  return Right.of(value.indexOf("{", from));
}

/**
 * The body of a `@case`: the first `{` that does not open a pattern. A pattern
 * brace comes first in the header, or after `|` (an alternative) or `not`; a
 * body brace comes after the pattern's last part.
 */
function caseBodyBrace(value: string, from: number): Parsed<number> {
  // The scan reads the header with its regex literals blanked, so a brace or bar
  // inside one is not structure.
  const text = blankRegexes(value.slice(from));
  let search = 0;
  for (;;) {
    const open = text.slice(search)
      .search(/[{[(]/);
    if (open === -1) {
      return Right.of(-1);
    }
    const at = search + open;
    if (text[at] === "(") {
      // A parenthesized pattern (`some({ id })`, a tuple) can hold braces: skip it whole.
      const close = matchingBrace(text, at);
      if (close === undefined) {
        return Left.of(unclosed(text[at]!));
      }
      search = close + 1;
      continue;
    }
    const before = text.slice(0, at)
      .trimEnd();
    if (before === "" || /(\||\bnot)$/.test(before)) {
      const close = matchingBrace(text, at);
      if (close === undefined) {
        return Left.of(unclosed(text[at]!));
      }
      search = close + 1;
    } else if (text[at] === "{") {
      return Right.of(from + at);
    } else {
      search = at + 1;
    }
  }
}

/**
 * The body of a `@map`: the first `{` that does not open a pattern. A pattern is
 * a `{` or `[` right after `let` or `track` (`let { id }`, `track { id }`), and
 * it is skipped with its contents.
 */
function mapBodyBrace(value: string, from: number): Parsed<number> {
  let search = from;
  for (;;) {
    const open = value.slice(search)
      .search(/[{[]/);
    if (open === -1) {
      return Right.of(-1);
    }
    const at = search + open;
    if (/(?:^|;)\s*(?:let|track)\s*$/.test(value.slice(from, at))) {
      const close = matchingBrace(value, at);
      if (close === undefined) {
        return Left.of(unclosed(value[at]!));
      }
      search = close + 1;
    } else if (value[at] === "{") {
      return Right.of(at);
    } else {
      search = at + 1;
    }
  }
}

const CLOSERS: Record<string, string> = { "[": "]", "(": ")", "{": "}" };

/** The error of a pattern whose bracket `opener` is never closed. */
function unclosed(opener: string): Error {
  return new Error(`Missing "${CLOSERS[opener]}" in the pattern`);
}

/**
 * The index of the bracket that closes the `{` or `[` at `open`, skipping quoted
 * text. Only brackets of the same kind are counted.
 */
function matchingBrace(value: string, open: number): number | undefined {
  const opener = value[open]!;
  const closer = CLOSERS[opener]!;
  let depth = 0;
  const quotes = new QuoteTracker();
  for (let i = open; i < value.length; i++) {
    const char = value[i]!;
    if (quotes.step(char)) {
      // A character of a string is never structure.
    } else if (char === opener) {
      depth++;
    } else if (char === closer) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return undefined;
}

/**
 * Read items until the end of the tokens, or, inside a block (`open` is its opening
 * token), its closing brace.
 */
function read(
  tokens: readonly Token[],
  state: ReadState,
  open: { readonly span: Span | undefined } | undefined,
): Parsed<Item[]> {
  const items: Item[] = [];
  while (state.position < tokens.length) {
    const token = tokens[state.position++]!;
    if (token.kind === "node") {
      items.push(token.node);
    } else if (token.kind === "open") {
      const body = match<Item[], Error, { error: Error } | { inner: Item[] }>(
        read(tokens, state, token),
        {
          Left: (error) => ({ error }),
          Right: (inner) => ({ inner }),
        },
      );
      if ("error" in body) {
        return Left.of(body.error);
      }
      items.push({
        kind: "block",
        keyword: token.keyword,
        header: token.header,
        body: attachElses(body.inner),
        span: blockSpan(token.span, state.closed),
      });
    } else {
      if (open === undefined) {
        return Left.of(compileError(`Unexpected "}" with no block to close`, token.span));
      }
      state.closed = token.span;
      return Right.of(items);
    }
  }
  if (open !== undefined) {
    return Left.of(compileError(`Missing "}" to close a block`, open.span));
  }
  return Right.of(items);
}

/** From a block's keyword to its closing brace, when both are known. */
function blockSpan(open: Span | undefined, close: Span | undefined): Span | undefined {
  if (open === undefined || close === undefined) {
    return undefined;
  }
  return { start: open.start, end: close.end };
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
