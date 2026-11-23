// The routes of the example app: the practical examples at "/", the API reference at "/api", and
// a page for any other URL. App is the shell around them: it is bootstrapped, not a route.

import type { Route } from "@tinker/router";
import { ApiDocs } from "../../apidoc/api-docs.ts";
import { Examples } from "./examples-page.ts";
import { NotFound } from "./not-found.ts";

export const ROUTES: readonly Route[] = [
  { path: "/", component: Examples },
  { path: "/api", component: ApiDocs },
  { path: "**", component: NotFound },
];
