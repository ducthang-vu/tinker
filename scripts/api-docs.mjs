// Generates the public API reference from TSDoc: one JSON file that the example app renders.
//
// The public API of a package is what its `exports` map names, read from source (the
// `development` condition, or the plain string). For each entry file, every export is
// resolved (re-exports are followed to their declaration) and described: its kind, its
// signatures or type, its TSDoc description and tags, and for a class or interface its
// public members.
//
// Tags:
// - `@deprecated` and `@final` are shown (`final` marks a class that cannot be subclassed).
// - `@privateAPI`, `@protected` and `@public` are read and not shown as tags.
// - `@internal` hides the item, as does a `private` or `#private` member. A `protected`
//   member is not part of the API an app uses, so it is not listed either.
//
// `npm run docs:api` writes examples/basics/api/api-reference.json; `--check` fails when the
// file is out of date (`npm test` runs it), as `repo-map:check` does.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = "examples/basics/api/api-reference.json";

// Types are printed in full, with the aliases a reader wrote, not expanded or cut short.
const FORMAT_FLAGS = ts.TypeFormatFlags.NoTruncation
  | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

function compareText(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function toRepoPath(rootDir, fileName) {
  return path.relative(rootDir, fileName)
    .split(path.sep)
    .join("/");
}

/** The entry files of the public API: one per `exports` entry of each package. */
export function publicEntries(rootDir) {
  const packagesDir = path.join(rootDir, "packages");
  return readdirSync(packagesDir)
    .sort(compareText)
    .flatMap((dir) => {
      const manifestPath = path.join(packagesDir, dir, "package.json");
      if (!existsSync(manifestPath)) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      return Object.entries(manifest.exports ?? {})
        .flatMap(([key, target]) => {
          const source = typeof target === "string" ? target : target.development;
          if (source === undefined) return [];
          const specifier = key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`;
          return [{ specifier, file: path.join(packagesDir, dir, source) }];
        });
    })
    .sort((a, b) => compareText(a.specifier, b.specifier));
}

function readCompilerOptions(rootDir) {
  const { config, error } = ts.readConfigFile(path.join(rootDir, "tsconfig.json"), ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  }
  return ts.parseJsonConfigFileContent(config, ts.sys, rootDir).options;
}

/** The text and the tags of a symbol's TSDoc, with `@internal` reported apart. */
function readDoc(symbol, checker) {
  const doc = {
    description: ts.displayPartsToString(symbol.getDocumentationComment(checker))
      .trim(),
    params: [],
    examples: [],
    see: [],
    throws: [],
    internal: false,
  };
  for (const tag of symbol.getJsDocTags(checker)) {
    const text = ts.displayPartsToString(tag.text ?? [])
      .trim();
    switch (tag.name) {
      case "param":
        doc.params.push(splitParam(text));
        break;
      case "returns":
      case "return":
        doc.returns = text;
        break;
      case "example":
        doc.examples.push(text);
        break;
      case "deprecated":
        doc.deprecated = text;
        break;
      case "final":
        doc.final = true;
        break;
      case "see":
        doc.see.push(text);
        break;
      case "throws":
        doc.throws.push(text);
        break;
      case "internal":
        doc.internal = true;
        break;
      default:
        // @privateAPI, @protected, @public and any other tag: read, not shown.
        break;
    }
  }
  return doc;
}

function splitParam(text) {
  const [, name, description] = /^(\S*)\s*(?:-\s*)?([\s\S]*)$/.exec(text);
  return { name, text: description.trim() };
}

function toDocFields(doc) {
  const fields = {
    description: doc.description,
    params: doc.params,
    examples: doc.examples,
    see: doc.see,
    throws: doc.throws,
  };
  if (doc.returns !== undefined) fields.returns = doc.returns;
  if (doc.deprecated !== undefined) fields.deprecated = doc.deprecated;
  if (doc.final) fields.final = true;
  return fields;
}

function sourceOf(declaration, rootDir) {
  const sourceFile = declaration.getSourceFile();
  const { line } = sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile));
  return `${toRepoPath(rootDir, sourceFile.fileName)}:${line + 1}`;
}

function callSignatures(type, name, checker, enclosing) {
  return type.getCallSignatures()
    .map((signature) => `${name}${checker.signatureToString(signature, enclosing, FORMAT_FLAGS)}`);
}

function kindOf(symbol) {
  const { flags } = symbol;
  if (flags & ts.SymbolFlags.Class) return "class";
  if (flags & ts.SymbolFlags.Interface) return "interface";
  if (flags & ts.SymbolFlags.TypeAlias) return "type";
  if (flags & ts.SymbolFlags.Enum) return "enum";
  if (flags & ts.SymbolFlags.Function) return "function";
  if (flags & ts.SymbolFlags.Variable) {
    const declaration = symbol.declarations?.[0];
    const isConst = declaration !== undefined && ts.isVariableDeclaration(declaration)
      && (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
    return isConst ? "const" : "variable";
  }
  return "other";
}

/** Public members declared by this symbol's own declaration (not inherited ones). */
function ownMembers(properties, symbol) {
  return properties.filter((property) => {
    const declarations = property.getDeclarations() ?? [];
    return declarations.some((declaration) => symbol.declarations?.includes(declaration.parent));
  });
}

function isHidden(declaration, doc) {
  if (doc.internal) return true;
  const modifiers = ts.getCombinedModifierFlags(declaration);
  if (modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return true;
  return declaration.name !== undefined && ts.isPrivateIdentifier(declaration.name);
}

function describeMember(property, checker, rootDir, isStatic) {
  const declaration = property.declarations?.[0];
  const doc = readDoc(property, checker);
  if (declaration === undefined || isHidden(declaration, doc)) return undefined;
  const type = checker.getTypeOfSymbol(property);
  const isMethod = (property.flags & ts.SymbolFlags.Method) !== 0;
  const member = {
    name: property.getName(),
    kind: isMethod ? "method" : "property",
    source: sourceOf(declaration, rootDir),
    ...toDocFields(doc),
  };
  if (isStatic) member.static = true;
  if (isMethod) {
    member.signatures = callSignatures(type, member.name, checker, declaration);
  } else {
    member.type = checker.typeToString(type, declaration, FORMAT_FLAGS);
  }
  return member;
}

function describeMembers(symbol, checker, rootDir) {
  const instance = checker.getDeclaredTypeOfSymbol(symbol)
    .getProperties();
  // The static side of a class is its constructor's type; `prototype` is not a member.
  const statics = symbol.flags & ts.SymbolFlags.Class
    ? checker.getTypeOfSymbol(symbol)
        .getProperties()
        .filter((property) => property.getName() !== "prototype")
    : [];
  return [
    ...ownMembers(instance, symbol)
      .map((p) => describeMember(p, checker, rootDir, false)),
    ...ownMembers(statics, symbol)
      .map((p) => describeMember(p, checker, rootDir, true)),
  ].filter((member) => member !== undefined);
}

function describeEnumMembers(symbol, checker, rootDir) {
  return [...(symbol.exports?.values() ?? [])]
    .filter((member) => member.flags & ts.SymbolFlags.EnumMember)
    .map((member) => {
      const declaration = member.declarations?.[0];
      const doc = readDoc(member, checker);
      if (declaration === undefined || isHidden(declaration, doc)) return undefined;
      const constant = checker.getConstantValue(declaration);
      const entry = {
        name: member.getName(),
        kind: "property",
        source: sourceOf(declaration, rootDir),
        ...toDocFields(doc),
      };
      if (constant !== undefined) entry.type = JSON.stringify(constant);
      return entry;
    })
    .filter((member) => member !== undefined);
}

function describeExport(exported, checker, rootDir) {
  const symbol = exported.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(exported)
    : exported;
  const declaration = symbol.declarations?.[0];
  const doc = readDoc(symbol, checker);
  if (declaration === undefined || doc.internal) return undefined;

  const kind = kindOf(symbol);
  const item = {
    name: exported.getName(),
    kind,
    source: sourceOf(declaration, rootDir),
    ...toDocFields(doc),
  };

  if (kind === "class" || kind === "function") {
    const type = checker.getTypeOfSymbol(symbol);
    item.signatures = kind === "class"
      ? type.getConstructSignatures()
          .map((signature) => `new ${item.name}${checker.signatureToString(signature, declaration, FORMAT_FLAGS)}`)
      : callSignatures(type, item.name, checker, declaration);
  }
  if (kind === "const" || kind === "variable") {
    item.type = checker.typeToString(checker.getTypeOfSymbol(symbol), declaration, FORMAT_FLAGS);
  }
  if (kind === "type" && ts.isTypeAliasDeclaration(declaration)) {
    item.declaration = declaration.getText();
  }
  if (kind === "class" || kind === "interface") {
    item.members = describeMembers(symbol, checker, rootDir);
  }
  if (kind === "enum") {
    item.members = describeEnumMembers(symbol, checker, rootDir);
  }
  return item;
}

function describeEntry({ specifier, file }, program, checker, rootDir) {
  const sourceFile = program.getSourceFile(file);
  if (sourceFile === undefined) {
    throw new Error(`Cannot read the entry of ${specifier}: ${toRepoPath(rootDir, file)}`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exports = moduleSymbol === undefined
    ? []
    : checker.getExportsOfModule(moduleSymbol)
        .flatMap((exported) => {
          const item = describeExport(exported, checker, rootDir);
          return item === undefined ? [] : [item];
        })
        .sort((a, b) => compareText(a.name, b.name));
  return { specifier, source: toRepoPath(rootDir, file), exports };
}

/** The API reference of the repository at `rootDir`: every public entry and its exports. */
export function buildApiReference(rootDir = ROOT) {
  const entries = publicEntries(rootDir);
  const program = ts.createProgram({
    rootNames: entries.map((entry) => entry.file),
    options: readCompilerOptions(rootDir),
  });
  const checker = program.getTypeChecker();
  return {
    entries: entries.map((entry) => describeEntry(entry, program, checker, rootDir)),
  };
}

export function renderApiReference(reference) {
  return `${JSON.stringify(reference, null, 2)}\n`;
}

function parseArgs(argv) {
  const options = { check: false, root: ROOT, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--root") {
      options.root = path.resolve(argv[(index += 1)]);
    } else if (arg === "--out") {
      options.output = argv[(index += 1)];
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }
  return options;
}

function runCli(argv) {
  const { check, root, output } = parseArgs(argv);
  const destination = path.resolve(root, output);
  const label = toRepoPath(root, destination);
  const content = renderApiReference(buildApiReference(root));

  if (check) {
    const current = existsSync(destination) ? readFileSync(destination, "utf8") : undefined;
    if (current !== content) {
      process.stderr.write(`${label} is out of date: run npm run docs:api\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${label} is up to date\n`);
    }
    return;
  }

  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
  process.stdout.write(`Wrote ${label}\n`);
}

const scriptPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (scriptPath === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
