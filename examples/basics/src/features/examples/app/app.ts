// The app's shell: a header with the links to the pages, the page the router shows in the outlet,
// and a footer. The router is provided in main.ts, over the routes in routes.ts.

import { Component } from "@tinker/core";
import { RouterLink, RouterOutlet } from "@tinker/router";

@Component({
  selector: "tk-app",
  template: `
    <header class="site-header">
      <div class="site-header-inner">
        <a class="brand" routerlink="/"><span class="brand-mark" aria-hidden="true">◆</span> Tinker</a>
        <nav class="nav" aria-label="Pages">
          <a routerlink="/">Examples</a>
          <a routerlink="/api">API reference</a>
        </nav>
      </div>
    </header>
    <main class="page">
      <router-outlet></router-outlet>
    </main>
    <footer class="site-footer">Tinker, a learning frontend framework built in TypeScript.</footer>
  `,
  imports: [RouterLink, RouterOutlet],
})
export class App {}
