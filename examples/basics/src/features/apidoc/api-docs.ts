// The documented thing the API pages show: an export or a member, with its signatures,
// description, params, returns and examples. The pages are api-layout.ts (the frame),
// api-overview.ts, api-package.ts (a package's exports) and api-symbol.ts (one export).
// The data is api-reference.json.

import { Component, input } from "@tinker/core";
import type { ViewDoc } from "./api-view.ts";

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
      @if (doc().inheritedFrom) { <span class="badge">from {{ doc().inheritedFrom }}</span> }
    </h3>
    @if (doc().deprecated) { <p class="deprecated">Deprecated: {{ doc().deprecated }}</p> }
    @map doc().signatures; let signature { <pre>{{ signature }}</pre> }
    @map doc().overloads; let overload {
      <div class="overload">
        <pre>{{ overload.declaration }}</pre>
        @map overload.description; let block { <p>{{ block.text }}</p> }
        @map overload.params; let param { <p class="param"><code>{{ param.name }}</code> {{ param.text }}</p> }
        @if (overload.returns) { <p><strong>Returns:</strong> {{ overload.returns }}</p> }
        @map overload.examples; let example { <pre>{{ example.text }}</pre> }
      </div>
    }
    @if (doc().type) { <pre>{{ doc().type }}</pre> }
    @if (doc().declaration) { <pre>{{ doc().declaration }}</pre> }
    @map doc().description; let block {
      @if (block.isCode) {
        <pre>{{ block.text }}</pre>
      } @else {
        @if (block.isList) {
          <ul>@map block.items; let item { <li>@map item; let part {@if (part.href) {<a href="{{ part.href }}">{{ part.text }}</a>} @else {@if (part.code) {<code>{{ part.text }}</code>} @else {<span>{{ part.text }}</span>}}}</li> }</ul>
        } @else {
          <p>@map block.parts; let part {@if (part.href) {<a href="{{ part.href }}">{{ part.text }}</a>} @else {@if (part.code) {<code>{{ part.text }}</code>} @else {<span>{{ part.text }}</span>}}}</p>
        }
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
        @if (block.isList) {
          <ul>@map block.items; let item { <li>@map item; let part {@if (part.href) {<a href="{{ part.href }}">{{ part.text }}</a>} @else {@if (part.code) {<code>{{ part.text }}</code>} @else {<span>{{ part.text }}</span>}}}</li> }</ul>
        } @else {
          <p>@map block.parts; let part {@if (part.href) {<a href="{{ part.href }}">{{ part.text }}</a>} @else {@if (part.code) {<code>{{ part.text }}</code>} @else {<span>{{ part.text }}</span>}}}</p>
        }
      }
    }
    @map doc().see; let target { <p><strong>See:</strong> {{ target }}</p> }
    <p class="source">{{ doc().source }}</p>
  `,
})
export class DocBody {
  readonly doc = input<ViewDoc>();
}
