// Sanitization: what a value from a template or a component may write to the DOM.
//
// A value is checked by the kind of attribute or property it goes to:
// - a URL attribute (href, src, srcset, …): a safe scheme, or relative (url-safety.ts);
// - `srcdoc` (HTML that runs script in a frame): only a TrustedHtml;
// - `style` (an attribute holding CSS): only a TrustedStyle;
// - a style property whose value loads a URL or runs an expression: only a TrustedStyle;
// - an event attribute (`on…`), `xmlns` and `is`: refused when the template or the host
//   metadata is read, so no value can set them.
// A value that is not allowed is not set: the attribute or property is removed, as for a
// missing value. The Sanitizer service is the author's way to allow one value on purpose.

import { Injectable } from "../../../di/index.ts";
import { isEventAttribute, isSafeUrlValue, isUrlAttribute } from "./url-safety.ts";

/**
 * The seal that only the Sanitizer has: the trusted classes take it in their constructor, and
 * its type cannot be named outside this module, so `new TrustedUrl(…)` from app code does not
 * compile. Trusted values are made by the Sanitizer service.
 */
const SEAL: unique symbol = Symbol("the Sanitizer");

/** A URL the author vouches for: a URL attribute bound to it is set without the check. */
export class TrustedUrl {
  constructor(readonly url: string, _seal: typeof SEAL) {}

  toString(): string {
    return this.url;
  }
}

/** HTML the author vouches for: `srcdoc` bound to it is set. */
export class TrustedHtml {
  constructor(readonly html: string, _seal: typeof SEAL) {}

  toString(): string {
    return this.html;
  }
}

/** CSS the author vouches for: a `style` attribute or property bound to it is set. */
export class TrustedStyle {
  constructor(readonly css: string, _seal: typeof SEAL) {}

  toString(): string {
    return this.css;
  }
}

/**
 * The service that makes trusted values. Inject it, and trust constant values in your own code:
 *
 *   readonly logo = inject(Sanitizer).trustUrl("data:image/png;base64,…");
 *
 * Trusting a value that comes from user input (a query string, say) defeats the check.
 */
@Injectable({ providedIn: "root" })
export class Sanitizer {
  /** Trust `url`: a URL attribute bound to the result is set even when `url` is unsafe. */
  trustUrl(url: string): TrustedUrl {
    return new TrustedUrl(url, SEAL);
  }

  /** Trust `html`: `[attr.srcdoc]` bound to the result is set. */
  trustHtml(html: string): TrustedHtml {
    return new TrustedHtml(html, SEAL);
  }

  /** Trust `css`: a `[attr.style]` or `[style.x]` bound to the result is set. */
  trustStyle(css: string): TrustedStyle {
    return new TrustedStyle(css, SEAL);
  }
}

/**
 * Why an attribute name cannot be bound at all, or undefined when it can. An event handler
 * (`on…`), or one that changes how the element is built (`xmlns`, `is`), is refused.
 */
export function refusalOf(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (isEventAttribute(lower)) {
    return `event attributes cannot be bound; use (${lower.slice(2)}) instead`;
  }
  if (lower === "xmlns" || lower === "is") {
    return `${lower} cannot be bound: it changes how the element is built`;
  }
  return undefined;
}

/**
 * The text an attribute bound to `value` is set to, or undefined to remove it. `null`,
 * `undefined` and `false` remove it; `true` sets it empty. A value that is not allowed for
 * `name` (see the header) is removed.
 */
export function attributeText(name: string, value: unknown): string | undefined {
  const text = value === null || value === undefined || value === false
    ? undefined
    : value === true ? "" : String(value);
  if (text === undefined) {
    return undefined;
  }
  const lower = name.toLowerCase();
  if (lower === "srcdoc") {
    return value instanceof TrustedHtml ? text : undefined;
  }
  if (lower === "style") {
    return value instanceof TrustedStyle ? text : undefined;
  }
  if (isUrlAttribute(lower)) {
    return value instanceof TrustedUrl || isSafeUrlValue(lower, text) ? text : undefined;
  }
  return text;
}

/** Whether `value` is a trusted value: one the checks above do not remove. */
export function isTrusted(value: unknown): boolean {
  return value instanceof TrustedUrl
    || value instanceof TrustedHtml
    || value instanceof TrustedStyle;
}

/** A style value that loads a URL or runs an expression, in any of these forms. */
const CSS_LOADS = /url\s*\(|image(?:-set)?\s*\(|src\s*\(|expression\s*\(|\\/i;

/**
 * The text a style property bound to `value` is set to, or undefined to remove it. A value
 * that loads a URL or runs an expression is removed, unless it is a TrustedStyle. A
 * backslash is refused too, since a CSS escape can spell out one of these functions.
 */
export function styleText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === false || value === "") {
    return undefined;
  }
  if (value instanceof TrustedStyle) {
    return value.css;
  }
  const text = String(value);
  return CSS_LOADS.test(text) ? undefined : text;
}
