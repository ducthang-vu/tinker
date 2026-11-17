// URL safety for attributes that take a URL (href, src, action, …). A URL such as
// `javascript:…` runs script when the browser follows it, so a binding to one of
// these attributes sets it only when the URL is safe: an http, https, mailto or tel
// URL, or a relative one. Anything else leaves the attribute unset. Event attributes
// (`on…`) are refused when the template or host metadata is read, so user text cannot
// become an event handler.

const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "cite",
  "poster",
]);
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
/** Resolves relative URLs: a relative one takes this base's protocol, which is safe. */
const BASE = "https://base.invalid/";

/** Whether `name` is an attribute whose value is a URL. */
export function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTES.has(name.toLowerCase());
}

/**
 * Whether `name` is an event attribute (`onclick`, …), which cannot be bound. Every
 * name starting with `on` is refused, since any of them may be an event handler.
 */
export function isEventAttribute(name: string): boolean {
  return /^on/i.test(name);
}

/** Whether `value` is a URL an attribute may hold: a safe scheme, or relative. */
export function isSafeUrl(value: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(value, BASE).protocol);
  } catch {
    return false;
  }
}
