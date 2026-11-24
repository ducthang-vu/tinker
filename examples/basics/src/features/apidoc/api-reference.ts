// The shape of api-reference.json, which scripts/api-docs.mjs writes from the TSDoc of each
// package's public exports. The file is generated: change the TSDoc, then run `npm run docs:api`.

import reference from "./api-reference.json";

export interface ApiParam {
  readonly name: string;
  readonly text: string;
}

/** One documented thing: an export, or a member of a class, interface or enum. */
export interface ApiDoc {
  readonly name: string;
  readonly kind: string;
  readonly source: string;
  readonly description: string;
  readonly params: readonly ApiParam[];
  readonly examples: readonly string[];
  readonly see: readonly string[];
  readonly throws: readonly string[];
  readonly returns?: string;
  /** Present, with the text after the tag (possibly empty), when the item is deprecated. */
  readonly deprecated?: string;
  /** Present when the class is marked `@final`: it cannot be subclassed. */
  readonly final?: boolean;
  readonly static?: boolean;
  /** Present for a member inherited from a base class: the name of that class. */
  readonly inheritedFrom?: string;
  readonly signatures?: readonly string[];
  /** Present for a function or method with more than one signature: each has its own doc. */
  readonly overloads?: readonly ApiOverload[];
  readonly type?: string;
  /** The source of a type alias, as written. */
  readonly declaration?: string;
}

/** One overload of a function or method: its signature, and its own TSDoc. */
export interface ApiOverload {
  readonly declaration: string;
  readonly description: string;
  readonly params: readonly ApiParam[];
  readonly returns?: string;
  readonly examples: readonly string[];
  readonly see: readonly string[];
  readonly throws: readonly string[];
}

export interface ApiExport extends ApiDoc {
  readonly members?: readonly ApiDoc[];
}

/** One public entry point, such as `@tinker/core`, with the exports it lists. */
export interface ApiEntry {
  readonly specifier: string;
  readonly source: string;
  readonly exports: readonly ApiExport[];
}

export interface ApiReference {
  readonly entries: readonly ApiEntry[];
}

export const apiReference: ApiReference = reference;
