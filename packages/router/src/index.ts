// The public API of the router: the route table, the router, and the location it reads and writes.

export type { Route } from "./route.ts";
export { Router } from "./router.ts";
export type { NavigateOptions } from "./router.ts";
export {
  NavigationCancelledError,
  NavigationFailedError,
  NavigationRejectedError,
  NoRouteError,
} from "./navigation.ts";
export type {
  Guard,
  GuardResult,
  Navigation,
  NavigationError,
  NavigationResult,
  Redirect,
} from "./navigation.ts";
export { ActivatedRoute } from "./activated-route.ts";
export { RouterOutlet } from "./router-outlet.ts";
export { RouterLink } from "./router-link.ts";
export { UrlBuilder } from "./url-builder.ts";
export { ChildActivatedRoute } from "./child-activated-route.ts";
export type { RouteMatch, RouteParams } from "./match.ts";
export { provideRouter } from "./provide-router.ts";
export { Location } from "./location.ts";
export { browserPlatformLocation, PLATFORM_LOCATION } from "./platform-location.ts";
export type { PlatformLocation } from "./platform-location.ts";
export type { ActionPayloads, ActionType, NavigationAction } from "./actions.ts";
