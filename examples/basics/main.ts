// Tinker basics: one app, a shell (app/app.ts) with a router over its pages (app/routes.ts).
// The practical examples are at "/", each card is one topic:
//
// - demos/counter/counter.ts: a component with its own provided store, a directive that
//   changes it, and an output the template listens to.
// - demos/highlight/highlight.ts: directives with host class and attribute bindings, shared
//   by the other files.
// - demos/clock/clock.ts: an @Effect that cleans up when destroyed, and @AfterNextRender.
// - demos/todos/todos.ts: @map over a list, track, the $ variables, destructuring, and the
//   empty case of @match.
// - demos/patterns/patterns.ts: @match with each pattern form.
// - demos/notice/notice.ts: a component whose template and CSS are files, next to it.
//
// The API reference, generated from the TSDoc, is at "/api" (api/api-docs.ts).

import { bootstrap, provide } from "@tinker/core";
import { valueOrThrow } from "@tinker/functional";
import { PLATFORM_LOCATION, provideRouter } from "@tinker/router";
import { App } from "./app/app.ts";
import { basedPlatformLocation } from "./app/base-location.ts";
import { ROUTES } from "./app/routes.ts";

// The bundle sits in the assets folder under the app's base: the root locally, or "/tinker/" on
// GitHub Pages. The router reads its paths from under that base.
const base = new URL("../", import.meta.url /* @vite-ignore: resolved at run time */).pathname;

// The first provider of a token wins, so the location for the base comes before provideRouter's,
// which would otherwise use the browser's own location.
valueOrThrow(bootstrap(App, {
  providers: [
    provide(PLATFORM_LOCATION, { useValue: basedPlatformLocation(base) }),
    ...provideRouter(ROUTES),
  ],
}));
