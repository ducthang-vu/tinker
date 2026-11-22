// The API page: each entry point is a section, with its exports, and each class or interface lists
// its members. The data is api-reference.json, written from the TSDoc by scripts/api-docs.mjs.
// `ApiDocs` renders the page; `DocBody` renders one documented thing (an export or a member).

import { Component, input } from "@tinker/core";
import { apiReference } from "./api-reference.ts";
import { toSections, type ViewDoc } from "./api-view.ts";

/** One documented thing: its signatures or type, its description, params, returns and examples. */
@Component({
  selector: "tk-doc-body",
  styles: `
    h3 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      font-size: 1.05rem;
      font-weight: 650;
      letter-spacing: -0.01em;
      margin-bottom: 0.5rem;
    }
    .kind, .badge {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border-radius: 999px;
      padding: 0.15rem 0.55rem;
    }
    .kind {
      color: var(--muted);
      background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .badge {
      color: var(--accent);
      background: var(--accent-soft);
    }
    p { margin: 0.5rem 0; }
    pre {
      margin: 0.5rem 0;
      padding: 0.75rem 1rem;
      background: var(--code);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow-x: auto;
      font-size: 0.85rem;
      line-height: 1.5;
    }
    code { font-size: 0.85em; }
    .deprecated {
      padding: 0.5rem 0.75rem;
      border-left: 3px solid #d97706;
      border-radius: 8px;
      background: color-mix(in srgb, #f59e0b 14%, transparent);
    }
    .source {
      margin-top: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.75rem;
      color: var(--muted);
    }
  `,
  template: `
    <h3>{{ doc().name }} <span class="kind">{{ doc().kind }}</span>
      @if (doc().static) { <span class="badge">static</span> }
      @if (doc().final) { <span class="badge">final</span> }
    </h3>
    @if (doc().deprecated) { <p class="deprecated">Deprecated: {{ doc().deprecated }}</p> }
    @map doc().signatures; let signature { <pre>{{ signature }}</pre> }
    @if (doc().type) { <pre>{{ doc().type }}</pre> }
    @if (doc().declaration) { <pre>{{ doc().declaration }}</pre> }
    @map doc().description; let block {
      @if (block.isCode) {
        <pre>{{ block.text }}</pre>
      } @else {
        <p>@map block.parts; let part {
          @if (part.code) { <code>{{ part.text }}</code> } @else { {{ part.text }} }
        }</p>
      }
    }
    @map doc().params; let param {
      <p class="param"><code>{{ param.name }}</code> {{ param.text }}</p>
    }
    @if (doc().returns) { <p><strong>Returns:</strong> {{ doc().returns }}</p> }
    @map doc().throws; let error { <p><strong>Throws:</strong> {{ error }}</p> }
    @map doc().examples; let block {
      @if (block.isCode) {
        <pre>{{ block.text }}</pre>
      } @else {
        <p>@map block.parts; let part {
          @if (part.code) { <code>{{ part.text }}</code> } @else { {{ part.text }} }
        }</p>
      }
    }
    @map doc().see; let target { <p><strong>See:</strong> {{ target }}</p> }
    <p class="source">{{ doc().source }}</p>
  `,
})
export class DocBody {
  readonly doc = input<ViewDoc>();
}

@Component({
  selector: "tk-api-docs",
  styles: `
    tk-api-docs { display: block; }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    nav a {
      padding: 0.35rem 0.85rem;
      font-size: 0.9rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      text-decoration: none;
    }
    nav a:hover { border-color: var(--accent); color: var(--accent); }
    section { margin-top: 3rem; }
    section > h2 {
      font-size: 1.4rem;
      letter-spacing: -0.01em;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    article {
      margin-top: 1rem;
      padding: 1.25rem 1.4rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }
    article > tk-doc-body + tk-doc-body { margin-top: 1.25rem; }
    h4 {
      margin: 1.5rem 0 0.5rem;
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .no-items { color: var(--muted); margin-top: 1rem; }
  `,
  template: `
    <header class="intro">
      <p class="eyebrow">API reference</p>
      <h1>Public API</h1>
      <p class="lede">
        Generated from the TSDoc of each package's public exports by
        <code>npm run docs:api</code>. Items marked <code>@privateAPI</code> are left out.
      </p>
    </header>
    <nav aria-label="Entry points">
      @map sections; let section {
        <a [attr.href]="section.href">{{ section.specifier }}</a>
      }
    </nav>
    @map sections; let section {
      <section [attr.id]="section.id">
        <h2>{{ section.specifier }}</h2>
        @if (section.hasItems) {
          @map section.items; let item {
            <article [attr.id]="item.id">
              <tk-doc-body [doc]="item"></tk-doc-body>
              @if (item.hasMembers) { <h4>Members</h4> }
              @map item.members; let member {
                <tk-doc-body [doc]="member"></tk-doc-body>
              }
            </article>
          }
        } @else {
          <p class="no-items">No public exports.</p>
        }
      </section>
    }
  `,
  imports: [DocBody],
})
export class ApiDocs {
  readonly sections = toSections(apiReference);
}
