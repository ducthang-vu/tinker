// End-to-end tests of the example app, run in a real browser against the built app.
// They run only after a merge to main (see .github/workflows/e2e.yml); locally:
//   npm run test:e2e --workspace @tinker/example-basics

/// <reference types="node" />

import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  webServer: {
    // Build the example, then serve the build the way it would be published.
    command: "npm run build && npm run preview",
    cwd: "..",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
