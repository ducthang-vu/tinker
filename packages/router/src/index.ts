// The public API of the router: the route table, the router, and the location it reads and writes.

export type { Route } from "./route.ts";
export { Router } from "./router.ts";
export type { RouteMatch, RouteParams } from "./match.ts";
export { provideRouter } from "./provide-router.ts";
export { Location } from "./location.ts";
export { browserPlatformLocation, PLATFORM_LOCATION } from "./platform-location.ts";
export type { PlatformLocation } from "./platform-location.ts";
