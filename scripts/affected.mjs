// Which packages a change affects, for running only their tests on a pull request.
// A package is affected when a file in it changed, or when a package it depends on
// (directly or through others) is affected. A change to the shared configuration of
// the repo affects every package.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

/** Files and folders whose change affects every package. */
const SHARED = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "vite.config.ts",
  "vite.shared.ts",
  "eslint.config.js",
  "scripts/",
  ".github/",
];

/**
 * The packages in `root/packages`: each with its name, its folder (relative to root),
 * and the workspace packages it depends on.
 */
export function readPackages(root) {
  const folder = path.join(root, "packages");
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join("packages", entry.name);
      const manifest = JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8"));
      const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
      return { name: manifest.name, dir, deps };
    });
}

/**
 * The folders of the packages to test, for the changed files (relative to the root).
 * A change to shared configuration returns every package.
 */
export function affectedPackages(changed, packages) {
  const everything = changed.some((file) =>
    SHARED.some((shared) => (shared.endsWith("/") ? file.startsWith(shared) : file === shared)));
  if (everything) return packages.map((pkg) => pkg.dir);

  const direct = new Set(
    packages
      .filter((pkg) => changed.some((file) => file === pkg.dir || file.startsWith(`${pkg.dir}/`)))
      .map((pkg) => pkg.name),
  );

  // Add every package that depends on an affected one, until nothing more is added.
  let grew = true;
  while (grew) {
    grew = false;
    for (const pkg of packages) {
      if (!direct.has(pkg.name) && pkg.deps.some((dep) => direct.has(dep))) {
        direct.add(pkg.name);
        grew = true;
      }
    }
  }
  return packages.filter((pkg) => direct.has(pkg.name))
    .map((pkg) => pkg.dir);
}
