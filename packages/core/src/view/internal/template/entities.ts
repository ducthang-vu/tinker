// The character references of the HTML 5 standard: the named ones (the full table, in
// entities-html5.ts) and the numeric ones. The parser decodes them in text and in attributes.
// A reference that is not in the table is kept as written.

import { HTML5_ENTITIES, LEGACY_ENTITY_NAMES } from "./entities-html5.ts";

/** The legacy names, the longest first: a reference takes the longest one it starts with. */
const LEGACY_LONGEST_FIRST = [...LEGACY_ENTITY_NAMES].sort((a, b) => b.length - a.length);

/** The legacy name a reference starts with, the longest one, or undefined. */
function legacyPrefix(body: string): string | undefined {
  return LEGACY_LONGEST_FIRST.find((name) => body.startsWith(name));
}

/**
 * Replaces the named and numeric references of `text` with the characters they name.
 *
 * A numeric reference is decoded only with its semicolon. A named one is decoded with its
 * semicolon, or, when it is a legacy name, without it: `&copy 2026` is "© 2026", and `&copyx`
 * is "©x". In an attribute value (`mode` "attribute"), a legacy name that is followed by `=` or
 * a letter or digit is kept as written, as HTML does. A numeric reference that is not a code
 * point (zero, a surrogate, or beyond U+10FFFF) becomes U+FFFD, as in HTML.
 */
export function decodeReferences(text: string, mode: "text" | "attribute" = "text"): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*)(;?)/g,
    (whole, body: string, semicolon: string, offset: number, source: string) => {
      if (body.startsWith("#")) {
        if (semicolon === "") {
          return whole;
        }
        const hex = /^#[xX]/.test(body);
        const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        return isCodePoint(code) ? String.fromCodePoint(code) : "�";
      }
      if (semicolon === ";" && HTML5_ENTITIES.has(body)) {
        return HTML5_ENTITIES.get(body)!;
      }
      const name = legacyPrefix(body);
      if (name === undefined) {
        return whole;
      }
      const rest = body.slice(name.length) + semicolon;
      const next = rest === "" ? (source[offset + whole.length] ?? "") : rest[0]!;
      if (mode === "attribute" && /[=A-Za-z0-9]/.test(next)) {
        return whole;
      }
      return HTML5_ENTITIES.get(name)! + rest;
    });
}

function isCodePoint(code: number): boolean {
  return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
}
