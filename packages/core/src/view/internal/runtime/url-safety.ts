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
  "background",
  "codebase",
  "data",
  "icon",
  "manifest",
  "lowsrc",
  "dynsrc",
  "usemap",
  "longdesc",
  "classid",
  "profile",
]);
/** Attributes that hold a list of URLs, each of which is checked: see `isSafeUrlValue`. */
const URL_LIST_ATTRIBUTES = new Set(["srcset", "ping"]);
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
/** Resolves relative URLs: a relative one takes this base's protocol, which is safe. */
const BASE = "https://base.invalid/";

/** Whether `name` is an attribute whose value is a URL, or a list of them. */
export function isUrlAttribute(name: string): boolean {
  const lower = name.toLowerCase();
  return URL_ATTRIBUTES.has(lower) || URL_LIST_ATTRIBUTES.has(lower);
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

/**
 * Whether every URL in `value` is safe for the attribute `name`. `srcset` lists candidates
 * (a URL and a descriptor each, separated by commas), so each candidate's URL is checked;
 * `ping` lists URLs separated by spaces; any other attribute holds one URL.
 */
export function isSafeUrlValue(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (lower === "srcset") {
    return value.split(",")
      .every((candidate) => isSafeUrl(/^\S*/.exec(candidate.trim())![0]));
  }
  if (lower === "ping") {
    return value.split(/\s+/)
      .every(isSafeUrl);
  }
  return isSafeUrl(value);
}
