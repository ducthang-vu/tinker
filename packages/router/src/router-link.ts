// RouterLink: an anchor that navigates the router instead of reloading the page. Its behaviour
// comes later.

import { Directive } from "@tinker/core";

@Directive({ selector: "a[routerlink]" })
export class RouterLink {}
