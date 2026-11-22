// The practical examples: each card is one part of the framework, working. Their source is in
// examples/basics, one file per topic (see the comment at the top of main.ts).

import { Component } from "@tinker/core";
import { Clock } from "../clock.ts";
import { Counter } from "../counter.ts";
import { Notice } from "../notice/notice.ts";
import { Patterns } from "../patterns.ts";
import { Todos } from "../todos.ts";

@Component({
  selector: "tk-examples",
  template: `
    <header class="intro">
      <p class="eyebrow">Practical examples</p>
      <h1>Examples</h1>
      <p class="lede">
        Each card is a small, working part of Tinker. The source of each is in
        <code>examples/basics</code>, one file per topic.
      </p>
    </header>
    <div class="demos">
      <tk-counter></tk-counter>
      <tk-clock></tk-clock>
      <tk-todos></tk-todos>
      <tk-patterns></tk-patterns>
      <tk-notice></tk-notice>
    </div>
  `,
  imports: [Counter, Clock, Todos, Patterns, Notice],
})
export class Examples {}
