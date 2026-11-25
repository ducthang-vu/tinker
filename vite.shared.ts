// What the Vite configs of this repo share. The code lives in @tinker/compiler's workspace
// module, so an app's config and the repo's configs use the same copy.

import { standardDecorators, workspaceAliases, workspacePackages } from "./packages/compiler/src/workspace.ts";

export { standardDecorators };

/** The aliases of the workspace packages, read from their source. */
export const workspaceAlias = workspaceAliases(workspacePackages);
