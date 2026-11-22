import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const TYPE_LENGTH_LIMIT = 240;
const DOC_LENGTH_LIMIT = 180;
const TEST_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".test.mts",
  ".test.cts",
  ".spec.ts",
  ".spec.tsx",
  ".spec.mts",
  ".spec.cts",
];

function toRepoPath(rootDir, fileName) {
  return path.relative(rootDir, fileName)
    .split(path.sep)
    .join("/");
}

function isWithinRoot(rootDir, fileName) {
  const relativePath = path.relative(rootDir, fileName);

  return relativePath === ""
    || (!relativePath.startsWith(`..${path.sep}`)
      && relativePath !== ".."
      && !path.isAbsolute(relativePath));
}

function isIncludedSourceFile(rootDir, sourceFile) {
  const fileName = path.resolve(sourceFile.fileName);
  const repoPath = toRepoPath(rootDir, fileName);

  return isWithinRoot(rootDir, fileName)
    && !sourceFile.isDeclarationFile
    && !repoPath.split("/")
      .includes("node_modules")
      && !TEST_SUFFIXES.some((suffix) => repoPath.endsWith(suffix));
}

function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function getSymbolType(checker, symbol, declaration) {
  const isTypeDeclaration = Boolean(
    symbol.flags & (
      ts.SymbolFlags.Class
      | ts.SymbolFlags.Interface
      | ts.SymbolFlags.TypeAlias
      | ts.SymbolFlags.Enum
    ),
  );
  const type = isTypeDeclaration
    ? checker.getDeclaredTypeOfSymbol(symbol)
    : checker.getTypeOfSymbolAtLocation(symbol, declaration);

  return truncate(
    checker.typeToString(type, declaration),
    TYPE_LENGTH_LIMIT,
  );
}

function getDocumentation(checker, symbol) {
  const documentation = ts.displayPartsToString(
    symbol.getDocumentationComment(checker),
  )
    .trim();

  return documentation ? truncate(documentation, DOC_LENGTH_LIMIT) : undefined;
}

function getExportEntries(sourceFile, checker, rootDir) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

  if (!moduleSymbol) return [];

  return checker.getExportsOfModule(moduleSymbol)
    .map((exportSymbol) => {
      const targetSymbol = exportSymbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exportSymbol)
        : exportSymbol;
      const declaration = targetSymbol.valueDeclaration
        ?? targetSymbol.declarations?.[0];

      if (!declaration) return undefined;

      const declarationFile = declaration.getSourceFile();
      const declarationPath = path.resolve(declarationFile.fileName);

      if (!isWithinRoot(rootDir, declarationPath)) return undefined;

      const entry = {
        name: exportSymbol.getName(),
        kind: ts.SyntaxKind[declaration.kind],
        definedIn: toRepoPath(rootDir, declarationPath),
        type: getSymbolType(checker, targetSymbol, declaration),
      };
      const documentation = getDocumentation(checker, targetSymbol);

      if (documentation) entry.documentation = documentation;

      return entry;
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getImports(sourceFile, compilerOptions, rootDir) {
  const imports = new Map();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      && !ts.isExportDeclaration(statement)
    ) {
      continue;
    }

    if (
      !statement.moduleSpecifier
      || !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const source = statement.moduleSpecifier.text;
    const resolvedModule = ts.resolveModuleName(
      source,
      sourceFile.fileName,
      compilerOptions,
      ts.sys,
    ).resolvedModule;
    const resolvedFileName = resolvedModule?.resolvedFileName;
    const resolved = resolvedFileName
      && isWithinRoot(rootDir, path.resolve(resolvedFileName))
      && !resolvedFileName.split(path.sep)
        .includes("node_modules")
      ? toRepoPath(rootDir, resolvedFileName)
      : undefined;
    const key = `${source}\0${resolved ?? ""}`;

    imports.set(key, resolved ? { source, resolved } : { source });
  }

  return [...imports.values()]
    .sort((left, right) => left.source.localeCompare(right.source));
}

function createGraph(files) {
  const nodes = new Map();
  const edges = new Map();

  function addNode(node) {
    nodes.set(node.id, node);
  }

  function addEdge(from, to, type) {
    const id = `${from}\0${type}\0${to}`;
    edges.set(id, { from, to, type });
  }

  for (const file of files) {
    const fileId = `file:${file.path}`;

    addNode({ id: fileId, type: "file", path: file.path });

    for (const imported of file.imports) {
      const targetId = imported.resolved
        ? `file:${imported.resolved}`
        : `module:${imported.source}`;

      if (!imported.resolved) {
        addNode({
          id: targetId,
          type: "module",
          name: imported.source,
        });
      }

      addEdge(fileId, targetId, "imports");
    }

    for (const exported of file.exports) {
      const symbolId = `symbol:${exported.definedIn}#${exported.name}`;
      const symbol = {
        id: symbolId,
        type: "symbol",
        name: exported.name,
        kind: exported.kind,
        definedIn: exported.definedIn,
        signature: exported.type,
      };

      if (exported.documentation) {
        symbol.documentation = exported.documentation;
      }

      addNode(symbol);
      addEdge(fileId, symbolId, "exports");
    }
  }

  return {
    schemaVersion: 2,
    nodes: [...nodes.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    edges: [...edges.values()].sort((left, right) =>
      left.from.localeCompare(right.from)
      || left.type.localeCompare(right.type)
      || left.to.localeCompare(right.to),
    ),
  };
}

/**
 * Build a compact, model-independent graph of the project's TypeScript surface.
 *
 * @param {string} rootDir Project directory containing tsconfig.json.
 */
export function buildRepoMap(rootDir = process.cwd()) {
  const absoluteRoot = path.resolve(rootDir);
  const configPath = ts.findConfigFile(
    absoluteRoot,
    ts.sys.fileExists,
    "tsconfig.json",
  );

  if (!configPath) {
    throw new Error(`No tsconfig.json found under ${absoluteRoot}`);
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    { noEmit: true },
    configPath,
  );
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles()
    .filter((sourceFile) => isIncludedSourceFile(absoluteRoot, sourceFile))
    .map((sourceFile) => ({
      path: toRepoPath(absoluteRoot, sourceFile.fileName),
      imports: getImports(sourceFile, parsedConfig.options, absoluteRoot),
      exports: getExportEntries(sourceFile, checker, absoluteRoot),
    }));

  return createGraph(files);
}

/**
 * Render the graph as a compact, model-friendly Markdown index.
 * The output intentionally omits prose and function bodies.
 */
export function renderRepoMapMarkdown(graph, options = {}) {
  const { includeDocs = false, include = () => true } = options;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const files = graph.nodes
    .filter((node) => node.type === "file" && include(node.path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const importsByFile = new Map();
  const exportsByFile = new Map();

  for (const edge of graph.edges) {
    if (edge.type === "imports") {
      const imports = importsByFile.get(edge.from) ?? [];
      imports.push(nodes.get(edge.to));
      importsByFile.set(edge.from, imports);
    } else if (edge.type === "exports") {
      const exports = exportsByFile.get(edge.from) ?? [];
      exports.push(nodes.get(edge.to));
      exportsByFile.set(edge.from, exports);
    }
  }

  const symbolCount = graph.nodes.filter((node) => node.type === "symbol").length;
  const externalCount = graph.nodes.filter((node) => node.type === "module").length;
  const lines = [
    `# Repo map v${graph.schemaVersion}`,
    `files:${files.length} symbols:${symbolCount} external:${externalCount}`,
  ];

  for (const file of files) {
    const imports = (importsByFile.get(file.id) ?? [])
      .filter(Boolean)
      .map((node) => node.type === "file" ? node.path : `pkg:${node.name}`)
      .sort();
    const exports = (exportsByFile.get(file.id) ?? [])
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name));
    lines.push(imports.length
      ? `${file.path} <- ${imports.join(",")}`
      : file.path);

    // One export per line: signatures may contain any character (`;`, `|`,
    // line breaks), so nothing is needed to separate them.
    for (const symbol of exports) {
      const origin = symbol.definedIn === file.path
        ? ""
        : `@${symbol.definedIn}`;

      lines.push(`  ${symbol.name}: ${oneLine(symbol.signature)}${origin}`);

      if (includeDocs && symbol.documentation) {
        lines.push(`    ${oneLine(symbol.documentation)}`);
      }
    }
  }

  return lines.join("\n")
    .trimEnd() + "\n";
}

/** Collapse whitespace, including line breaks, so a value stays on one line. */
function oneLine(value) {
  return value.replace(/\s+/g, " ")
    .trim();
}

/**
 * Packages whose `src/` modules each have a map of their own. `packages/core` is the only
 * one large enough to need it: its modules (`signals`, `di`, `view`, ...) are scopes too.
 */
const SPLIT_PACKAGES = ["packages/core"];

/**
 * The folders that have a map of their own: each package and each example, which are
 * the folders with a package.json under `packages/` and `examples/`, and the top-level
 * modules of the split packages.
 */
export function scopesOf(rootDir) {
  const packageScopes = ["packages", "examples"].flatMap((parent) => {
    const folder = path.join(rootDir, parent);
    if (!existsSync(folder)) {
      return [];
    }
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()
        && existsSync(path.join(folder, entry.name, "package.json")))
      .map((entry) => `${parent}/${entry.name}`);
  });
  const moduleScopes = SPLIT_PACKAGES.flatMap((pkg) => {
    const folder = path.join(rootDir, pkg, "src");
    if (!existsSync(folder)) {
      return [];
    }
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${pkg}/src/${entry.name}`);
  });
  return [...packageScopes, ...moduleScopes].sort();
}

/**
 * The scope a file belongs to: the most specific scope that holds it, so a module inside
 * a split package belongs to the module, not to the package. `null` is outside every scope.
 */
function scopeOf(file, scopes) {
  let found = null;
  for (const scope of scopes) {
    if (file.startsWith(`${scope}/`) && (found === null || scope.length > found.length)) {
      found = scope;
    }
  }
  return found;
}

/**
 * Every map, as a path (relative to the root) and its content. The root's map has the
 * files outside every scope; each scope's map has the files whose most specific scope it
 * is. A file's imports and exports are listed wherever they are, so a map names the files
 * it depends on.
 */
export function renderAllMarkdown(graph, scopes) {
  const maps = new Map([[
    ".repo-map.md",
    renderRepoMapMarkdown(graph, {
      include: (path) => scopeOf(path, scopes) === null,
    }),
  ]]);
  for (const scope of scopes) {
    maps.set(`${scope}/.repo-map.md`, renderRepoMapMarkdown(graph, {
      include: (path) => scopeOf(path, scopes) === scope,
    }));
  }
  return maps;
}

function runCli(args) {
  let outputPath;
  let rootDir = process.cwd();
  let writeToStdout = false;
  let pretty = false;
  let format = "json";
  let includeDocs = false;
  let check = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--root") {
      rootDir = args[++index];
      if (!rootDir) throw new Error("--root requires a directory");
    } else if (argument === "--output") {
      outputPath = args[++index];
      if (!outputPath) throw new Error("--output requires a file path");
    } else if (argument === "--stdout") {
      writeToStdout = true;
    } else if (argument === "--pretty") {
      pretty = true;
    } else if (argument === "--format") {
      format = args[++index];
      if (!["json", "markdown"].includes(format)) {
        throw new Error("--format must be json or markdown");
      }
    } else if (argument === "--include-docs") {
      includeDocs = true;
    } else if (argument === "--check") {
      check = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const repoMap = buildRepoMap(rootDir);

  if (format === "markdown" && check) {
    const stale = [...renderAllMarkdown(repoMap, scopesOf(rootDir))]
      .filter(([file, content]) => !existsSync(path.join(rootDir, file))
        || readFileSync(path.join(rootDir, file), "utf8") !== content)
      .map(([file]) => file);
    if (stale.length > 0) {
      throw new Error(`The repo map is out of date: ${stale.join(", ")}. Run npm run repo-map -- --format markdown`);
    }
    return;
  }

  if (format === "markdown" && outputPath === undefined && !writeToStdout) {
    for (const [file, content] of renderAllMarkdown(repoMap, scopesOf(rootDir))) {
      writeFileSync(path.join(rootDir, file), content);
      process.stdout.write(`Wrote ${file}\n`);
    }
    return;
  }

  const output = format === "markdown"
    ? renderRepoMapMarkdown(repoMap, { includeDocs })
    : `${JSON.stringify(repoMap, null, pretty ? 2 : undefined)}\n`;

  if (writeToStdout) {
    process.stdout.write(output);
    return;
  }

  const destination = path.resolve(
    rootDir,
    outputPath ?? (format === "markdown" ? ".repo-map.md" : ".repo-map.json"),
  );
  writeFileSync(destination, output);
  process.stdout.write(`Wrote ${path.relative(rootDir, destination)}\n`);
}
const scriptPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined;
const currentPath = fileURLToPath(import.meta.url);

if (scriptPath === currentPath) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
