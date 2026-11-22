// The public API of the router: the route table, the router, and the location it reads and writes.

export type { Route } from "./lib/router/route.ts";
export { NoRouteError, Router } from "./lib/router/router.ts";
export type { NavigateOptions } from "./lib/router/router.ts";
export { ActivatedRoute } from "./lib/state/activated-route.ts";
export { RouterOutlet } from "./lib/directives/router-outlet.ts";
export { RouterLink } from "./lib/directives/router-link.ts";
export { UrlBuilder } from "./lib/router/url-builder.ts";
export { ChildActivatedRoute } from "./lib/state/child-activated-route.ts";
export type { RouteMatch, RouteParams } from "./lib/router/match.ts";
export { provideRouter } from "./lib/router/provide-router.ts";
export { Location } from "./lib/location/location.ts";
export { browserPlatformLocation, PLATFORM_LOCATION } from "./lib/location/platform-location.ts";
export type { PlatformLocation } from "./lib/location/platform-location.ts";
