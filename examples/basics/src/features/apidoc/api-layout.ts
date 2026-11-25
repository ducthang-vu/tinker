// The API pages' frame: a sidebar that lists the packages, and the page for the current URL, in the
// outlet. Each package has a page of its exports, and each export has its own page.

import { Component } from "@tinker/core";
import { RouterLink, RouterOutlet } from "@tinker/router";
import { apiReference } from "./api-reference.ts";
import { packageLinks } from "./api-pages.ts";

@Component({
  selector: "tk-api-layout",
  styles: `
    .frame {
      display: grid;
      grid-template-columns: 15rem minmax(0, 1fr);
      gap: 2.5rem;
      align-items: start;
    }
    .sidebar {
      position: sticky;
      top: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .sidebar a {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.45rem 0.65rem;
      border-radius: 8px;
      text-decoration: none;
      font-size: 0.92rem;
    }
    .sidebar a:hover { background: var(--surface-2); }
    .count { color: var(--muted); font-size: 0.8rem; }
    .content { min-width: 0; }
    @media (max-width: 760px) {
      .frame { grid-template-columns: minmax(0, 1fr); gap: 1.25rem; }
      .sidebar { position: static; flex-direction: row; flex-wrap: wrap; }
      .sidebar a { padding: 0.3rem 0.6rem; background: var(--surface); border: 1px solid var(--border); }
    }
  `,
  template: `
    <div class="frame">
    <aside class="sidebar" aria-label="Packages">
      <a routerlink="/api">Overview</a>
      @map packages; let pkg {
        <a [routerlink]="pkg.href"><span>{{ pkg.specifier }}</span><span class="count">{{ pkg.count }}</span></a>
      }
    </aside>
    <div class="content">
      <router-outlet></router-outlet>
    </div>
    </div>
  `,
  imports: [RouterLink, RouterOutlet],
})
export class ApiLayout {
  readonly packages = packageLinks(apiReference.entries);
}
