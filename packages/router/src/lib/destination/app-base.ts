// The app's base: the deployment prefix the app is served under, such as "/app" for an app at
// example.com/app. The base is read from the page's <base> element by the platform, so routes and
// paths stay app-relative. This token is not provided by anything yet.

import { InjectionToken } from "@tinker/core";

/** The base the app is served under, without a trailing slash. `""` when served at the root. */
export const APP_BASE = new InjectionToken<string>("APP_BASE");
