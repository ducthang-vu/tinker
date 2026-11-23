// The private API of core, for the testing helpers only (@tinker/core/testing). Each item is
// marked @privateAPI in its doc: an app should not import it, and it may change without notice.

export { Engine, type EngineOptions } from "./internal/engine.ts";
export { inputsOf } from "./internal/authoring/input.ts";
export { inputNamesOf } from "./internal/authoring/input-names.ts";
export { outputsOf } from "./internal/authoring/output.ts";
export { getComponentMetadata, getDirectiveMetadata } from "./internal/authoring/decorators.ts";
export { CLASS_REPLACEMENTS } from "./internal/tokens.ts";
