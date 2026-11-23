// Tinker basics: one app. Its shell (features/examples/app/app.ts) routes to its pages
// (features/examples/app/routes.ts).
// The practical examples are at "/", each card is one topic:
//
// - features/examples/demos/counter/counter.ts: a component with its own provided store,
//   a directive that changes it, and an output the template listens to.
// - features/examples/demos/highlight/highlight.ts: directives with host class and attribute
//   bindings, shared by the other files.
// - features/examples/demos/clock/clock.ts: an @Effect that cleans up when destroyed, and
//   @AfterNextRender.
// - features/examples/demos/todos/todos.ts: @map over a list, track, the $ variables,
//   destructuring, and the empty case of @match.
// - features/examples/demos/patterns/patterns.ts: @match with each pattern form.
// - features/examples/demos/notice/notice.ts: a component whose template and CSS are files,
//   next to it.
//
// The API reference, generated from the TSDoc, is at "/api" (features/apidoc/api-docs.ts).

import { bootstrap } from "@tinker/core";
import { provideRouter } from "@tinker/router";
import { App } from "./features/examples/app/app.ts";
import { ROUTES } from "./features/examples/app/routes.ts";

// The router finds the folder the app is served under from the page's <base> element.
bootstrap(App, { providers: provideRouter(ROUTES) });
