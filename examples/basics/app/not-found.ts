// The page for a URL that no route matches.

import { Component } from "@tinker/core";
import { RouterLink } from "@tinker/router";

@Component({
  selector: "tk-not-found",
  template: `
    <section class="intro">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <p class="lede"><a routerlink="/">Back to the examples</a></p>
    </section>
  `,
  imports: [RouterLink],
})
export class NotFound {}
