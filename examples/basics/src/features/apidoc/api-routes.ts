// The routes under /api: the API layout, and its pages. They load when the first API page is
// reached, so the reference data is not in the first download.

import type { Route } from "@tinker/router";
import { ApiLayout } from "./api-layout.ts";
import { ApiOverview } from "./api-overview.ts";
import { ApiPackage, ApiPackageList } from "./api-package.ts";
import { ApiSymbol } from "./api-symbol.ts";

/** The API pages under the lazy `api` route: the layout, and the package and symbol pages. */
export const API_CHILDREN: readonly Route[] = [
  {
    path: "",
    component: ApiLayout,
    loadChildren: () =>
      Promise.resolve([
        {
          path: ":package",
          component: ApiPackage,
          loadChildren: () =>
            Promise.resolve([
              { path: ":symbol", component: ApiSymbol },
              { path: "", component: ApiPackageList },
            ]),
        },
        { path: "", component: ApiOverview },
      ]),
  },
];
