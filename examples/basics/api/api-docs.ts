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
  template: `
    <h2>Public API</h2>
    <p>
      Generated from the TSDoc of each package's public exports by
      <code>npm run docs:api</code>. Items marked <code>@privateAPI</code> are listed.
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
