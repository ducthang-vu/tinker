// Injection tokens for the view layer's swappable pieces. Renderer and
// TemplateParser are interfaces (no runtime value), so they need tokens.
// The engine provides browser defaults; any of them can be replaced with a
// provider, e.g. `provide(RENDERER, { useClass: ServerRenderer })`.

import { InjectionToken } from "../../di/index.ts";
import type { Class } from "../../utils/types.ts";
import type { Renderer } from "./renderer.ts";
import type { TemplateParser } from "./template/parser.ts";

/** The document the app runs in (default: the global one). */
export const DOCUMENT = new InjectionToken<Document>("DOCUMENT");

/** Builds the DOM (default: a DomRenderer on DOCUMENT). */
export const RENDERER = new InjectionToken<Renderer>("RENDERER");

/** Turns templates into syntax trees (default: the browser's parser on DOCUMENT). */
export const TEMPLATE_PARSER = new InjectionToken<TemplateParser>("TEMPLATE_PARSER");

/**
 * Classes that templates use in place of an imported class: an import found as a key is
 * replaced by its value, with that value's metadata. Empty by default.
 * @privateAPI For the testing helpers only (mocks). Do not use it in an app, unless you
 * accept that it may change without notice.
 */
export const CLASS_REPLACEMENTS = new InjectionToken<ReadonlyMap<Class<object>, Class<object>>>(
  "CLASS_REPLACEMENTS",
);
