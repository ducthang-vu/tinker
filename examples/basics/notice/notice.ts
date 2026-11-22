// A component whose CSS is a file. `styleUrl` names notice.css, next to this file: the
// build reads it into the component's styles, so the page links to nothing. The file
// and the component share this folder, as a component and its stylesheet always do.

import { Component } from "@tinker/core";

@Component({
  selector: "tk-notice",
  template: `<aside class="notice"><h3>Notice</h3><p>Styled by notice.css, in this folder.</p></aside>`,
  styleUrl: "./notice.css",
})
export class Notice {}
