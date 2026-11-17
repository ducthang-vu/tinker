// Runs the tests, with 100% line and branch coverage, of the packages a change affects.
// Usage: node scripts/run-affected.mjs --base <ref>   (e.g. origin/main)

import { spawnSync } from "node:child_process";
import process from "node:process";
import { affectedPackages, readPackages } from "./affected.mjs";

const baseIndex = process.argv.indexOf("--base");
const base = baseIndex === -1 ? undefined : process.argv[baseIndex + 1];
if (!base) {
  console.error("Usage: node scripts/run-affected.mjs --base <ref>");
  process.exit(2);
}

const root = process.cwd();
const diff = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" });
if (diff.status !== 0) {
  console.error(diff.stderr);
  process.exit(diff.status ?? 1);
}
const changed = diff.stdout.split("\n")
  .filter(Boolean);
const folders = affectedPackages(changed, readPackages(root));

if (folders.length === 0) {
  console.log("No package is affected by this change: no tests to run.");
  process.exit(0);
}

console.log(`Affected packages: ${folders.join(", ")}`);
for (const folder of folders) {
  console.log(`\n== ${folder}`);
  const run = spawnSync(
    "npx",
    [
      "vitest", "run", `${folder}/src`,
      "--coverage.enabled=true",
      `--coverage.include=${folder}/src/**/*.ts`,
      `--coverage.exclude=${folder}/src/**/*.test.ts`,
    ],
    { stdio: "inherit" },
  );
  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }
}
