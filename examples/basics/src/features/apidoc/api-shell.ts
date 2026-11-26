// The shell of the API pages: it shows nothing of its own. Its children, the API layout and its
// pages, load when the first API page is reached, so the reference data is not in the first
// download.

import { Component } from "@tinker/core";
import { RouterOutlet } from "@tinker/router";

@Component({
  selector: "tk-api-shell",
  imports: [RouterOutlet],
  template: "<router-outlet></router-outlet>",
})
export class ApiShell {}
