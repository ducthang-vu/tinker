// The API page: each entry point is a section, with its exports, and each class or interface lists
// its members. The data is api-reference.json, written from the TSDoc by scripts/api-docs.mjs.
// `ApiDocs` renders the sections; `DocBody` renders one documented thing (an export or a member).

import { Component, input } from "@tinker/core";
import { apiReference } from "./api-reference.ts";
import { toSections, type ViewDoc } from "./api-view.ts";

/** One documented thing: its signatures or type, its description, params, returns and examples. */
@Component({
  selector: "tk-doc-body",
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
    tk-api-docs { display: block; flex-basis: 100%; }
      h2 { margin-top: 2.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; }
      article { margin: 1.5rem 0; padding: 0.5rem 1rem; border-left: 3px solid #ccc; }
      h3 { margin: 0.5rem 0; font-size: 1.1rem; }
      h4 { margin: 1.2rem 0 0.3rem; }
      .kind { font-size: 0.8rem; font-weight: normal; color: #555; margin-left: 0.4rem; }
      .badge { font-size: 0.75rem; border: 1px solid #888; border-radius: 4px; padding: 0 0.3rem; margin-left: 0.3rem; }
      .deprecated { color: #8a4b00; background: #fff3d6; padding: 0.2rem 0.5rem; }
      .source { font-size: 0.8rem; color: #666; }
      pre { background: #f5f5f5; padding: 0.5rem 0.7rem; overflow-x: auto; border-radius: 4px; }
      nav p { margin: 0.2rem 0; }
  `,
  template: `
    <h2>Public API</h2>
    <p>
      Generated from the TSDoc of each package's public exports by
      <code>npm run docs:api</code>. Items marked <code>@privateAPI</code> are left out.
    </p>
    <nav>
      @map sections; let section {
        <p><a [attr.href]="section.href">{{ section.specifier }}</a></p>
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
          <p>No public exports.</p>
        }
      </section>
    }
  `,
  imports: [DocBody],
})
export class ApiDocs {
  readonly sections = toSections(apiReference);
}
