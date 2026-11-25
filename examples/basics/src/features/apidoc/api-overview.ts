// The API overview: the packages, each with its number of exports, and a link to its page.

import { Component } from "@tinker/core";
import { RouterLink } from "@tinker/router";
import { apiReference } from "./api-reference.ts";
import { packageLinks } from "./api-pages.ts";

@Component({
  selector: "tk-api-overview",
  styles: `
    tk-api-overview { display: block; }
    h1 { font-size: 2rem; letter-spacing: -0.02em; margin-bottom: 0.5rem; }
    .lede { color: var(--muted); max-width: 60ch; }
    .cards {
      margin-top: 2rem;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
      gap: 1rem;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding: 1.1rem 1.2rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      text-decoration: none;
    }
    .card:hover { border-color: var(--accent); }
    .card span { color: var(--muted); font-size: 0.85rem; }
  `,
  template: `
    <h1>API reference</h1>
    <p class="lede">Choose a package to list its exports. Each export has its own page with its full documentation.</p>
    <div class="cards">
      @map packages; let pkg {
        <a class="card" [routerlink]="pkg.href"><strong>{{ pkg.specifier }}</strong><span>{{ pkg.count }} exports</span></a>
      }
    </div>
  `,
  imports: [RouterLink],
})
export class ApiOverview {
  readonly packages = packageLinks(apiReference.entries);
}
