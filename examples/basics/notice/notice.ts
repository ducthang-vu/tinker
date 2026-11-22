// A component whose template and CSS are files. `templateUrl` names notice.html, and
// `styleUrl` names notice.css, both next to this file: the build reads them into the
// component, so the page links to nothing. The component and its files share this folder.

import { Component } from "@tinker/core";

@Component({
  selector: "tk-notice",
  templateUrl: "./notice.html",
  styleUrl: "./notice.css",
})
export class Notice {}
