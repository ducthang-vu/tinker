// One export's page: its full documentation, and its members. The package and the export are read
// from the router's current match, so the page follows the URL when it changes.

import { Component, computed, inject } from "@tinker/core";
import { Router, RouterLink } from "@tinker/router";
import { apiReference } from "./api-reference.ts";
import { viewItemOf } from "./api-pages.ts";
import { DocBody } from "./api-docs.ts";

@Component({
  selector: "tk-api-symbol",
  styles: `
    tk-api-symbol { display: block; }
    .crumbs { color: var(--muted); font-size: 0.85rem; margin-bottom: 1rem; }
    .crumbs a { color: inherit; }
    .members { margin-top: 2rem; }
    .members > h2 { font-size: 1.1rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border); }
  `,
  template: `
    <p class="crumbs"><a routerlink="/api">API</a> / <a [routerlink]="packageHref()">{{ slug() }}</a> / {{ name() }}</p>
    @if (item() === undefined) {
      <p>There is no export named "{{ name() }}" in this package.</p>
    } @else {
      <tk-doc-body [doc]="item()"></tk-doc-body>
      @if (members().length > 0) {
        <section class="members">
          <h2>Members</h2>
          @map members(); let member {
            <tk-doc-body [doc]="member"></tk-doc-body>
          }
        </section>
      }
    }
  `,
  imports: [DocBody, RouterLink],
})
export class ApiSymbol {
  private readonly router = inject(Router);
  readonly slug = computed(() => this.router.match()?.params["package"] ?? "");
  readonly name = computed(() => this.router.match()?.params["symbol"] ?? "");
  readonly packageHref = computed(() => `/api/${this.slug()}`);
  readonly item = computed(() => viewItemOf(apiReference, this.router.match()?.params ?? {}));
  readonly members = computed(() => this.item()?.members ?? []);
}
