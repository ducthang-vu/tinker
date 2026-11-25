// The data the API pages show, computed from the generated reference: the packages in the sidebar,
// the exports of a package grouped by kind, and the item one symbol page shows. The functions are
// pure, so they are tested without a page.

import type { ApiEntry, ApiExport, ApiReference } from "./api-reference.ts";
import { toSections, type ViewItem } from "./api-view.ts";
import type { RouteParams } from "@tinker/router";

/** A package in the sidebar: its URL name, specifier, number of exports, and page. */
export interface PackageLink {
  readonly slug: string;
  readonly specifier: string;
  readonly count: number;
  readonly href: string;
}

/** A group of exports on a package page: a kind's label, and its exports. */
export interface KindGroup {
  readonly label: string;
  readonly items: readonly ApiExport[];
}

/**
 * The URL name of a package: `@tinker/core` is `core`, and `@tinker/core/compiler` is
 * `core-compiler`.
 */
export function slugOf(specifier: string): string {
  return specifier.replace(/^@tinker\//, "")
    .replace(/\//g, "-");
}

/** The sidebar's packages, in the reference's order. */
export function packageLinks(entries: readonly ApiEntry[]): PackageLink[] {
  return entries.map((entry) => {
    const slug = slugOf(entry.specifier);
    return { slug, specifier: entry.specifier, count: entry.exports.length, href: `/api/${slug}` };
  });
}

/** The entry point with that URL name, if there is one. */
export function entryOf(entries: readonly ApiEntry[], slug: string): ApiEntry | undefined {
  return entries.find((entry) => slugOf(entry.specifier) === slug);
}

/** The kinds a package page lists, in order, each under its label. */
const KINDS: readonly { readonly kind: string; readonly label: string }[] = [
  { kind: "class", label: "Classes" },
  { kind: "interface", label: "Interfaces" },
  { kind: "function", label: "Functions" },
  { kind: "const", label: "Constants" },
  { kind: "variable", label: "Variables" },
  { kind: "type", label: "Types" },
  { kind: "enum", label: "Enums" },
];

/**
 * The exports grouped by kind, in KINDS' order. A kind with no export is left out, and an export
 * of another kind is listed under "Other", last.
 */
export function groupByKind(exports: readonly ApiExport[]): KindGroup[] {
  const groups = KINDS.map(({ kind, label }) => ({
    label,
    items: exports.filter((item) => item.kind === kind),
  }));
  const other = exports.filter((item) => !KINDS.some(({ kind }) => kind === item.kind));
  return [...groups, { label: "Other", items: other }].filter((group) => group.items.length > 0);
}

/** The first sentence of a description: what a package page shows under each name. */
export function summaryOf(description: string): string {
  return description.split(/(?<=\.)\s/)[0]!;
}

/**
 * The item a symbol page shows: the export `params.symbol` of the package `params.package`, as the
 * generated sections show it (with its members). Undefined when the URL names none.
 */
export function viewItemOf(reference: ApiReference, params: RouteParams): ViewItem | undefined {
  const entry = entryOf(reference.entries, params["package"] ?? "");
  const section = toSections(reference)
    .find((candidate) => candidate.specifier === entry?.specifier);
  return section?.items.find((item) => item.name === params["symbol"]);
}
