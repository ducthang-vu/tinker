// The routes of the example app: the practical examples at "/", the API reference at "/api", and
// a page for any other URL. App is the shell around them: it is bootstrapped, not a route.

import type { Route } from "@tinker/router";
import { ApiShell } from "../../apidoc/api-shell.ts";
import { Examples } from "./examples-page.ts";
import { NotFound } from "./not-found.ts";

export const ROUTES: readonly Route[] = [
  { path: "/", component: Examples },
  {
    path: "api",
    component: ApiShell,
    // The API pages load the first time they are reached, so the reference data is not downloaded
    // with the practical examples.
    loadChildren: () => import("../../apidoc/api-routes.ts").then((module) => module.API_CHILDREN),
  },
  { path: "**", component: NotFound },
];
