// Component styles, scoped to their component (emulated encapsulation, as Angular does).
//
// A component's `styles` are a CSS string. Its selectors are rewritten to match only
// the elements of its own template: each element it creates gets the attribute
// `tk-cN`, and every selector gets `[tk-cN]` on its last compound, so
//
//   .card > b:hover { … }   becomes   .card > b[tk-cN]:hover { … }
//
// `:host` is the component's host element, which its parent's template creates, so
// it gets the attribute `tk-hN`: `:host(.big)` becomes `[tk-hN].big`. The rules are
// added once per component class, to the document's head. Only the rules of the
// selectors are rewritten: `@media` and `@supports` blocks are scoped inside, and
// `@keyframes` and `@font-face` are copied as they are.

import { type AbstractClass } from "../../../utils/types.ts";
import { getComponentMetadata } from "../authoring/decorators.ts";
import type { Renderer } from "../renderer.ts";

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
  return getComponentMetadata(type)
    .getOrElse(undefined)?.styles === undefined
    ? undefined
    : styleScopeOf(type);
}

/**
 * Add the styles of component `type`, scoped, to the document (once per class), and
 * mark its `host` element. Does nothing for a component without styles.
 */
export function applyComponentStyles(renderer: Renderer, type: AbstractClass, host: Element): void {
  const styles = getComponentMetadata(type)
    .getOrElse(undefined)?.styles;
  if (styles === undefined) {
    return;
  }
  const scope = styleScopeOf(type);
  renderer.addStyleSheet(scope.attribute, scopeStyles(styles, scope));
  renderer.setAttribute(host, scope.hostAttribute, "");
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
      out += prelude.startsWith("@")
        ? `${prelude}{${AT_BLOCK_WITH_RULES.test(prelude) ? scopeBlock(body, scope) : body}}`
        : `${scopeSelectorList(prelude, scope)}{${body}}`;
      index = close + 1;
    }
  }
  return out;
}

/** The index of the first `{` or `;` from `from`, or undefined when there is none. */
function nextStatementEnd(css: string, from: number): number | undefined {
  const found = [css.indexOf("{", from), css.indexOf(";", from)]
    .filter((index) => index !== -1);
  return found.length === 0 ? undefined : Math.min(...found);
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

/**
 * One complex selector, scoped. `:host` becomes the host attribute; then the last
 * compound gets the component's attribute, unless it is the host itself (which the
 * parent's template created, and so does not carry the component's attribute).
 */
function scopeSelector(selector: string, scope: StyleScope): string {
  const host = `[${scope.hostAttribute}]`;
  const replaced = selector
    .replace(/:host\(([^()]*)\)/g, `${host}$1`)
    .replace(/:host\b/g, host);
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
