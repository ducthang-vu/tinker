// The routes of the example app: the practical examples at "/", the API reference at "/api", and
// a page for any other URL. App is the shell around them: it is bootstrapped, not a route.

import type { Route } from "@tinker/router";
import { ApiLayout } from "../../apidoc/api-layout.ts";
import { ApiOverview } from "../../apidoc/api-overview.ts";
import { ApiPackage, ApiPackageList } from "../../apidoc/api-package.ts";
import { ApiSymbol } from "../../apidoc/api-symbol.ts";
import { Examples } from "./examples-page.ts";
import { NotFound } from "./not-found.ts";

export const ROUTES: readonly Route[] = [
  { path: "/", component: Examples },
  {
    path: "api",
    component: ApiLayout,
    children: [
      {
        path: ":package",
        component: ApiPackage,
        children: [
          { path: ":symbol", component: ApiSymbol },
          { path: "", component: ApiPackageList },
        ],
      },
      { path: "", component: ApiOverview },
    ],
  },
  { path: "**", component: NotFound },
];
