// The files of a new app, by their path in the app's folder. Each is what `tinker new` writes.
// The app is a root component (`App`) in src/app.ts, bootstrapped by src/main.ts.

/** The files of a new app named `name`, by their path relative to the app's folder. */
export function appFiles(name: string): Map<string, string> {
  return new Map([
    ["package.json", packageJson(name)],
    ["index.html", indexHtml(name)],
    ["vite.config.ts", viteConfig()],
    ["src/main.ts", mainTs()],
    ["src/app.ts", appTs(name)],
  ]);
}

function packageJson(name: string): string {
  return `${JSON.stringify({
    name,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "tinker dev",
      build: "tinker build",
      preview: "tinker preview",
    },
    dependencies: {
      "@tinker/core": "*",
    },
    devDependencies: {
      "@tinker/cli": "*",
      "@tinker/compiler": "*",
    },
  }, null, 2)}\n`;
}

function indexHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <tk-app></tk-app>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
`;
}

function viteConfig(): string {
  return `// The app's build settings: the Tinker config (the compiler, the decorators, the aliases, and
// the base element the router reads).
import { tinkerConfig } from "@tinker/compiler";

const config = tinkerConfig();

export default {
  plugins: [...config.plugins],
  resolve: { alias: [...config.aliases] },
};
`;
}

function mainTs(): string {
  return `import { bootstrap } from "@tinker/core";
import { App } from "./app.ts";

bootstrap(App);
`;
}

function appTs(name: string): string {
  return `import { Component } from "@tinker/core";

@Component({
  selector: "tk-app",
  template: \`<h1>{{ title }}</h1>\`,
})
export class App {
  readonly title = "${name}";
}
`;
}
