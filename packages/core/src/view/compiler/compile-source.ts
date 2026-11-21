// Parse and compile one template, without rendering it: the check a build step
// runs on each component's template. It uses the same parser and compiler as the
// engine, so it reports the errors the engine would report at its first render.
//
// The imports are given by their selectors and whether each is a component, and
// optionally by their class. A build step has no class references: its compiled
// nodes name a placeholder class instead, which the check does not read.

import { Either, toError, type EitherError } from "@tinker/functional";
import type { Class } from "../../utils/types.ts";
import { type CompiledNode, compileTemplate, type DirectiveCandidate } from "../internal/template/compile.ts";
import { Selector } from "../internal/template/selector.ts";
import { combineSyntaxErrors, TinkerTemplateParser } from "../internal/template/tinker-parser.ts";

/** A directive or component a template may use, known by its selector. */
export interface ImportedSelector {
  /** The CSS-like selector, as the directive declares it, e.g. `"tk-item"` or `"[marked]"`. */
  readonly selector: string;
  readonly isComponent: boolean;
  /** The class itself, when there is one: the compiled nodes refer to it. */
  readonly type?: Class<object>;
}

/** The class the compiled nodes refer to in a check, where a build step has none. */
class Unbound {}

/**
 * Parse and compile `source` against `imports`. Right with the compiled nodes, or
 * left with the error: a `TemplateSyntaxError` for the syntax, or the compiler's
 * error for an invalid `{{ }}`, an element matching two components, or an
 * invalid selector in `imports`.
 */
export function compileSource(
  source: string,
  imports: readonly ImportedSelector[] = [],
): EitherError<readonly CompiledNode[]> {
  return Either.tryCatch(() => {
    const { nodes, errors } = new TinkerTemplateParser()
      .parseAll(source);
    if (errors.length > 0) {
      throw combineSyntaxErrors(errors);
    }
    return compileTemplate(nodes, imports.map(candidateOf));
  })
    .mapLeft(toError);
}

function candidateOf(imported: ImportedSelector): DirectiveCandidate {
  return {
    type: imported.type ?? Unbound,
    selector: Selector.parse(imported.selector)
      .getOrThrow(),
    isComponent: imported.isComponent,
  };
}
