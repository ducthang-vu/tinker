// Component styles, scoped to their component (emulated encapsulation, as Angular does).
//
// A component's `styles` are a CSS string. Its selectors are rewritten to match only
// the elements of its own template: each element it creates gets the attribute
// `tk-cN`, and every selector gets `[tk-cN]` on its last compound, so
//
//   .card > b:hover { … }   becomes   .card > b[tk-cN]:hover { … }
//
// `:host` is the component's host element, which its parent's template creates, so
// it gets the attribute `tk-hN`: `:host(.big)` becomes `[tk-hN].big`.
//
// `:deep(…)` is the one exception to the scoping, for the author who must style a
// child component's elements from the parent (an escape hatch, to be rare): the part
// inside it is not scoped, so `.card :deep(.title)` becomes `.card[tk-cN] .title`. The rules are
// added once per component class, to the document's head. Only the rules of the
// selectors are rewritten: `@media` and `@supports` blocks are scoped inside, and
// `@keyframes` and `@font-face` are copied as they are.

import { type AbstractClass } from "../../../utils/types.ts";
import { getComponentMetadata } from "../authoring/decorators.ts";
import type { Renderer } from "../renderer.ts";
import { getOrElse, match, use } from "@tinker/functional";

/** The attributes that scope a component's styles: its elements', and its host's. */
export interface StyleScope {
  readonly attribute: string;
  readonly hostAttribute: string;
}

const scopes = new WeakMap<AbstractClass, StyleScope>();
let scopeCount = 0;

/** The scope of a component class: created on first use, the same after. */
export function styleScopeOf(type: AbstractClass): StyleScope {
  let scope = scopes.get(type);
  if (scope === undefined) {
    scopeCount += 1;
    scope = { attribute: `tk-c${scopeCount}`, hostAttribute: `tk-h${scopeCount}` };
    scopes.set(type, scope);
  }
  return scope;
}

/** The scope of `type`, if it is a component with styles; none otherwise. */
export function scopeOfComponent(type: AbstractClass): StyleScope | undefined {
  return getOrElse(getComponentMetadata(type), undefined)?.styles === undefined
    ? undefined
    : styleScopeOf(type);
}

/** The live instances of each class with styles: its stylesheet stays while one is left. */
const liveInstances = new Map<AbstractClass, number>();

/**
 * Add the styles of component `type`, scoped, to the document, and mark its `host` element.
 * Returns the release for that instance: when the last live instance of the class is
 * released, its stylesheet is removed (and added again by the next instance). Does nothing
 * for a component without styles: its release does nothing either.
 */
export function applyComponentStyles(
  renderer: Renderer,
  type: AbstractClass,
  host: Element,
): () => void {
  const styles = getOrElse(getComponentMetadata(type), undefined)?.styles;
  if (styles === undefined) {
    return () => undefined;
  }
  const scope = styleScopeOf(type);
  renderer.addStyleSheet(scope.attribute, scopeStyles(styles, scope));
  renderer.setAttribute(host, scope.hostAttribute, "");
  liveInstances.set(type, (liveInstances.get(type) ?? 0) + 1);
  return () => releaseStyles(renderer, type, scope);
}

/** One instance of `type` is gone: remove its stylesheet when none is left. */
function releaseStyles(renderer: Renderer, type: AbstractClass, scope: StyleScope): void {
  // A release always follows the apply that counted the instance.
  const live = liveInstances.get(type)! - 1;
  if (live > 0) {
    liveInstances.set(type, live);
    return;
  }
  liveInstances.delete(type);
  renderer.removeStyleSheet(scope.attribute);
}

const AT_BLOCK_WITH_RULES = /^@(media|supports|container|layer|document)\b/;

/** `css` with every selector scoped to `scope`. */
export function scopeStyles(css: string, scope: StyleScope): string {
  return scopeBlock(css.replace(/\/\*[\s\S]*?\*\//g, ""), scope);
}

/** The rules of one block (the whole sheet, or the inside of a `@media`). */
function scopeBlock(css: string, scope: StyleScope): string {
  let out = "";
  let index = 0;
  while (index < css.length) {
    const next = nextStatementEnd(css, index);
    if (next === undefined) {
      return out + css.slice(index);
    }
    if (css[next] === ";") {
      out += css.slice(index, next + 1);
      index = next + 1;
    } else {
      const close = closingBrace(css, next);
      const prelude = css.slice(index, next)
        .trim();
      const body = css.slice(next + 1, close);
      // A rule's body holds declarations and nested rules: the nested rules are scoped too.
      out += prelude.startsWith("@")
        ? `${prelude}{${AT_BLOCK_WITH_RULES.test(prelude) ? scopeBlock(body, scope) : body}}`
        : `${scopeSelectorList(prelude, scope)}{${scopeBlock(body, scope)}}`;
      index = close + 1;
    }
  }
  return out;
}

/** The index of the first `{` or `;` from `from`, or undefined when there is none. */
function nextStatementEnd(css: string, from: number): number | undefined {
  let quote: string | undefined;
  for (let i = from; i < css.length; i += 1) {
    const char = css[i]!;
    if (quote !== undefined) {
      quote = char === quote ? undefined : quote;
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "{" || char === ";") {
      return i;
    }
  }
  return undefined;
}

/** The index of the `}` closing the `{` at `open`, or the end of `css` when it is not closed. */
function closingBrace(css: string, open: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = open; i < css.length; i += 1) {
    const char = css[i]!;
    if (quote !== undefined) {
      quote = char === quote ? undefined : quote;
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return css.length;
}

/** The selectors of a rule's prelude, each scoped, joined as a list. */
function scopeSelectorList(prelude: string, scope: StyleScope): string {
  return splitTopLevel(prelude, ",")
    .map((selector) => scopeSelector(selector.trim(), scope))
    .join(", ");
}

/** The escape hatch: `:deep(selector)` leaves what it wraps unscoped (see `scopeBeforeDeep`). */
const DEEP = ":deep(";

/**
 * One complex selector, scoped. `:host` becomes the host attribute; then the last
 * compound gets the component's attribute, unless it is the host itself (which the
 * parent's template created, and so does not carry the component's attribute).
 * A `:deep(...)` splits the selector: see `scopeBeforeDeep`.
 */
function scopeSelector(selector: string, scope: StyleScope): string {
  const host = `[${scope.hostAttribute}]`;
  const replaced = selector
    .replace(/:host\(([^()]*)\)/g, `${host}$1`)
    .replace(/:host\b/g, host);
  // `&` is the scoped parent (a nested rule's selector): it is already scoped, so is left as it is.
  if (replaced.includes("&")) {
    return replaced;
  }
  const deep = replaced.indexOf(DEEP);
  return deep === -1
    ? markLastCompound(replaced, scope)
    : scopeBeforeDeep(replaced, deep, scope);
}

/**
 * A selector with `:deep(inner)` at `at`, scoped to the component only up to the marker:
 * `.card :deep(.title)` becomes `.card[tk-cN] .title`, so the rule reaches the `.title`
 * inside a child component's template. What is before the marker is scoped as usual; a
 * marker at the start (`:deep(.title)`) is scoped to the host, and a marker after a
 * combinator (`.card > :deep(.title)`) scopes the `*` it stands for. Only the first
 * marker has this meaning: any text after it is copied as it is.
 */
function scopeBeforeDeep(selector: string, at: number, scope: StyleScope): string {
  const close = closingParen(selector, at + DEEP.length);
  const inner = selector.slice(at + DEEP.length, close);
  const after = selector.slice(close + 1);
  const before = selector.slice(0, at)
    .trim();
  const base = before === ""
    ? `[${scope.hostAttribute}]`
    : /[>+~]$/.test(before) ? `${before} *` : before;
  return `${markLastCompound(base, scope)} ${inner.trim()}${after}`;
}

/** The index of the `)` closing the parenthesis before `from`, or the end if it is not closed. */
function closingParen(text: string, from: number): number {
  let depth = 1;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === "(") {
      depth += 1;
    } else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return text.length;
}

/** The last compound of a selector gets the component's attribute, unless it is the host. */
function markLastCompound(replaced: string, scope: StyleScope): string {
  const host = `[${scope.hostAttribute}]`;
  const outside = topLevelMask(replaced);
  const lastCombinator = [...replaced].reduce(
    (last, char, index) => (outside[index] && " >+~".includes(char) ? index : last),
    -1,
  );
  if (replaced.slice(lastCombinator + 1)
    .includes(host)) {
    return replaced;
  }
  const pseudo = [...replaced].findIndex((char, index) =>
    index > lastCombinator && outside[index] && char === ":");
  const at = pseudo === -1 ? replaced.length : pseudo;
  return `${replaced.slice(0, at)}[${scope.attribute}]${replaced.slice(at)}`;
}

/** Which characters of `text` are outside quotes, brackets and parentheses. */
function topLevelMask(text: string): boolean[] {
  let depth = 0;
  let quote: string | undefined;
  return [...text].map((char) => {
    const outside = depth === 0 && quote === undefined;
    if (quote !== undefined) {
      quote = char === quote ? undefined : quote;
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    }
    return outside;
  });
}

/** Splits `text` at `separator`, except where it is inside quotes, brackets or parentheses. */
function splitTopLevel(text: string, separator: string): string[] {
  const outside = topLevelMask(text);
  const parts: string[] = [];
  let start = 0;
  [...text].forEach((char, index) => {
    if (char === separator && outside[index]) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  });
  parts.push(text.slice(start));
  return parts;
}
