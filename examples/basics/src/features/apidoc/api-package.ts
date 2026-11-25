// A package's page. ApiPackage is the frame: its child shows the package's exports (the empty
// path), or one export (`:symbol`). The package is read from the router's current match.

import { Component, computed, inject } from "@tinker/core";
import { Router, RouterLink, RouterOutlet } from "@tinker/router";
import { apiReference } from "./api-reference.ts";
import type { ApiExport } from "./api-reference.ts";
import { entryOf, groupByKind, summaryOf } from "./api-pages.ts";

@Component({
  selector: "tk-api-package",
  template: `<router-outlet></router-outlet>`,
  imports: [RouterOutlet],
})
export class ApiPackage {}

@Component({
  selector: "tk-api-package-list",
  styles: `
    tk-api-package-list { display: block; }
    h1 { font-size: 2rem; letter-spacing: -0.02em; }
    .crumbs { color: var(--muted); font-size: 0.85rem; }
    h2 {
      margin-top: 2.25rem;
      font-size: 1.1rem;
      padding-bottom: 0.4rem;
      border-bottom: 1px solid var(--border);
    }
    ul { list-style: none; padding: 0; margin: 0.5rem 0 0; }
    li { padding: 0.55rem 0; border-bottom: 1px solid var(--border); }
    li a { font-weight: 600; text-decoration: none; }
    li a:hover { color: var(--accent); }
    li p { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.9rem; }
  `,
  template: `
    @if (entry() === undefined) {
      <p>There is no package named "{{ slug() }}".</p>
    } @else {
      <p class="crumbs"><a routerlink="/api">API</a> / {{ specifier() }}</p>
      <h1>{{ specifier() }}</h1>
      @map groups(); let group {
        <h2>{{ group.label }}</h2>
        <ul>
          @map group.items; let item {
            <li>
              <a [routerlink]="hrefOf(item)">{{ item.name }}</a>
              <p>{{ summary(item.description) }}</p>
            </li>
          }
        </ul>
      }
    }
  `,
  imports: [RouterLink],
})
export class ApiPackageList {
  private readonly router = inject(Router);
  readonly slug = computed(() => this.router.match()?.params["package"] ?? "");
  readonly entry = computed(() => entryOf(apiReference.entries, this.slug()));
  readonly specifier = computed(() => this.entry()?.specifier ?? "");
  readonly groups = computed(() => {
    const entry = this.entry();
    return entry === undefined ? [] : groupByKind(entry.exports);
  });

  hrefOf(item: ApiExport): string {
    return `/api/${this.slug()}/${item.name}`;
  }

  summary(description: string): string {
    return summaryOf(description);
  }
}
