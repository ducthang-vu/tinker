// The routes of the example app: the practical examples at "/", the API reference at "/api", and
// a page for any other URL. The root route shows nothing itself, since App is the shell; each
// page is one of its children.

import type { Route } from "@tinker/router";
import { ApiDocs } from "../../apidoc/api-docs.ts";
import { Examples } from "./examples-page.ts";
import { NotFound } from "./not-found.ts";

export const ROUTES: Route = {
  path: "",
  children: [
    { path: "/", component: Examples },
    { path: "/api", component: ApiDocs },
    { path: "**", component: NotFound },
  ],
};
