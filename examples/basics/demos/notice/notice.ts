// A component whose template and CSS are files. `templateUrl` names notice.html, and
// `styleUrls` lists notice.css and notice-colors.css, all next to this file: the build reads
// them into the component, so the page links to nothing. The component and its files share
// this folder.

import { Component } from "@tinker/core";

@Component({
  selector: "tk-notice",
  templateUrl: "./notice.html",
  styleUrls: ["./notice.css", "./notice-colors.css"],
})
export class Notice {}
