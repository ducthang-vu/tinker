// The files of a new app, by their path in the app's folder. Each is what `tinker new` writes.
// The app is a root component (`App`) in src/app.ts, bootstrapped by src/main.ts.

/** The files of a new app named `name`, by their path relative to the app's folder. */
export function appFiles(name: string, prefix: string): Map<string, string> {
  return new Map([
    ["package.json", packageJson(name, prefix)],
    ["index.html", indexHtml(name, prefix)],
    ["vite.config.ts", viteConfig()],
    ["src/main.ts", mainTs()],
    ["src/app.ts", appTs(name, prefix)],
    ["tsconfig.json", tsconfig()],
    [".gitignore", gitignore()],
    ["README.md", readme(name)],
  ]);
}

function packageJson(name: string, prefix: string): string {
  return `${JSON.stringify({
    name,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "tinker dev",
      build: "tinker build",
      preview: "tinker preview",
      typecheck: "tsc --noEmit",
    },
    dependencies: {
      "@tinker/core": "*",
    },
    devDependencies: {
      "@tinker/cli": "*",
      "@tinker/compiler": "*",
      "typescript": "npm:@typescript/typescript6@6.0.2",
    },
    tinker: { prefix },
  }, null, 2)}\n`;
}

function indexHtml(name: string, prefix: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <${prefix}-app></${prefix}-app>
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

function appTs(name: string, prefix: string): string {
  return `import { Component } from "@tinker/core";

@Component({
  selector: "${prefix}-app",
  template: \`<h1>{{ title }}</h1>\`,
})
export class App {
  readonly title = "${name}";
}
`;
}

/** The compiler settings: strict TypeScript, with the `.ts` import paths the app uses. */
function tsconfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      noEmit: true,
      customConditions: ["development"],
    },
    include: ["src", "vite.config.ts"],
  }, null, 2)}\n`;
}

/** What git should not keep: the installed packages, the build, and logs. */
function gitignore(): string {
  return `node_modules/
dist/
*.log
`;
}

/** How to run the app, for whoever opens it next. */
function readme(name: string): string {
  return `# ${name}

A Tinker app.

## Commands

\`\`\`bash
npm install        # install the packages
npm run dev        # serve the app, until it is stopped
npm run build      # build the app into dist/
npm run preview    # serve the built app (run build first)
npm run typecheck  # check the types
\`\`\`
`;
}
