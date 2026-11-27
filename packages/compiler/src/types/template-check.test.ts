import { describe, expect, test } from "vitest";
import ts from "typescript";
import { compileSource, type CompiledNode } from "@tinker/core/compiler";
import { valueOrThrow } from "@tinker/functional";
import { checkFileOf, type CheckedTemplate } from "./template-check.ts";

/** The compiled nodes of a template, as the plugin compiles them. */
function nodesOf(template: string): readonly CompiledNode[] {
  return valueOrThrow(compileSource(template, []));
}

const page = (template: string, functions: CheckedTemplate["functions"] = []): CheckedTemplate => ({
  name: "Page",
  file: "/app/page.ts",
  nodes: nodesOf(template),
  functions,
});

const outputFile = "/app/page.template-check.ts";

describe("checkFileOf", () => {
  test("checks each component in a function that takes the component as $c, imported from its file", () => {
    const text = checkFileOf([page("<p>{{ title }}</p>")], outputFile);
    expect(text)
      .toContain("import type { Page } from \"./page.ts\";");
    expect(text)
      .toContain("export function check_Page($c: Page): void {");
    expect(text)
      .toContain("void ($c[\"title\"]);");
  });

  test("the component receiver, as a value, is the component the check takes", () => {
    const template: CheckedTemplate = {
      name: "Page",
      file: "/app/page.ts",
      nodes: [{ kind: "text", interpolation: { strings: ["", ""], expressions: [{ kind: "component" }] } }],
      functions: [],
    };
    const text = checkFileOf([template], outputFile);
    expect(text)
      .toContain("void ($c);");
  });

  test("a file with no components has no import and no function", () => {
    const text = checkFileOf([], outputFile);
    expect(text)
      .not
      .toContain("import type");
    expect(text)
      .not
      .toContain("export function");
  });

  test("the specifier to a component in another folder goes up through its parents", () => {
    const text = checkFileOf([{ ...page("<p></p>"), file: "/app/other/page.ts" }], "/app/deep/page.template-check.ts");
    expect(text)
      .toContain("import type { Page } from \"../other/page.ts\";");
  });

  test("a component's member is read, and called, through the component", () => {
    const text = checkFileOf([page("<p>{{ count() }}</p>")], outputFile);
    expect(text)
      .toContain("void (($c[\"count\"])());");
  });

  test("a @let is a constant of its block, and a read of it is the constant", () => {
    const text = checkFileOf([page("@let total = count + 1;<p>{{ total }}</p>")], outputFile);
    expect(text)
      .toContain("const total = ($c[\"count\"] + 1);");
    expect(text)
      .toContain("void (total);");
  });

  test("a @map's list must be an array, and its item is typed from the list", () => {
    const text = checkFileOf([page("@map todos(); let todo { <p>{{ todo }}{{ $index }}</p> }")], outputFile);
    expect(text)
      .toContain("const $list = (($c[\"todos\"])()) satisfies readonly unknown[];");
    expect(text)
      .toContain("const todo: (typeof $list)[number] = null as never;");
    expect(text)
      .toContain("const $index: number = 0;");
    expect(text)
      .toContain("const $first: boolean = false;");
  });

  test("an object pattern types each name from its field, and an array pattern from its index", () => {
    const text = checkFileOf(
      [page("@map rows(); let { id, tags: [first, ...others] } { <p>{{ id }}{{ first }}{{ others }}</p> }")],
      outputFile,
    );
    expect(text)
      .toContain("const id: ((typeof $list)[number])[\"id\"] = null as never;");
    expect(text)
      .toContain("const first: (((typeof $list)[number])[\"tags\"])[0] = null as never;");
    expect(text)
      .toContain("const others: (((typeof $list)[number])[\"tags\"])[number][] = null as never;");
  });

  test("an array pattern with no rest binds only its items", () => {
    const text = checkFileOf([page("@map pairs(); let [a, b] { <p>{{ a }}{{ b }}</p> }")], outputFile);
    expect(text)
      .toContain("const b: ((typeof $list)[number])[1] = null as never;");
  });

  test("a name given with as has the type of what it names, and so does the inner pattern's", () => {
    const text = checkFileOf([page("@map rows(); let { id } as row { <p>{{ id }}{{ row }}</p> }")], outputFile);
    expect(text)
      .toContain("const row: (typeof $list)[number] = null as never;");
    expect(text)
      .toContain("const id: ((typeof $list)[number])[\"id\"] = null as never;");
  });

  test("a regex group is a string or undefined, and a name inside another pattern is any", () => {
    const text = checkFileOf(
      [page("@map rows(); let { code: /(?<digits>\\d+)/, found: some(inner), kind: \"a\" } { <p>{{ digits }}{{ inner }}</p> }")],
      outputFile,
    );
    expect(text)
      .toContain("const digits: string | undefined = null as never;");
    expect(text)
      .toContain("const inner: any = null as never;");
  });

  test("a @map's track expression is checked in the row's scope, and its fields on the item", () => {
    const byValue = checkFileOf([page("@map todos(); let todo; track todo.id { <p></p> }")], outputFile);
    expect(byValue)
      .toContain("void ((todo)[\"id\"]);");
    const byFields = checkFileOf([page("@map todos(); let todo; track { id, kind } { <p></p> }")], outputFile);
    expect(byFields)
      .toContain("void (null as never as (typeof $list)[number])[\"id\"];");
    expect(byFields)
      .toContain("void (null as never as (typeof $list)[number])[\"kind\"];");
  });

  test("a template function is called through its class instance, imported from its file", () => {
    const text = checkFileOf(
      [page("<p>{{ format(price()) }}</p>", [{ name: "format", className: "Format", file: "/app/format.ts" }])],
      outputFile,
    );
    expect(text)
      .toContain("import { Format as $cls_0 } from \"./format.ts\";");
    expect(text)
      .toContain("const $fn_format: InstanceType<typeof $cls_0> = null as never;");
    expect(text)
      .toContain("void ($fn_format.call(($c[\"price\"])()));");
  });

  test("two template functions from one class share its import", () => {
    const text = checkFileOf(
      [page("<p>{{ a() }}{{ b() }}</p>", [
        { name: "a", className: "Fns", file: "/app/fns.ts" },
        { name: "b", className: "Fns", file: "/app/fns.ts" },
      ])],
      outputFile,
    );
    expect(text.match(/import \{ Fns as/g))
      .toHaveLength(1);
  });

  test("a template function read on its own is a function value", () => {
    const text = checkFileOf(
      [page("<p>{{ todos().filter(isOpen) }}</p>", [{ name: "isOpen", className: "IsOpen", file: "/app/open.ts" }])],
      outputFile,
    );
    expect(text)
      .toContain("((...args: any[]) => $fn_isOpen.call(...args))");
  });

  test("the built-in $flow is typed loosely", () => {
    const text = checkFileOf([page("<p>{{ $flow(double, add)(1) }}</p>")], outputFile);
    expect(text)
      .toContain("$flow($c[\"double\"], $c[\"add\"])");
    expect(text)
      .not
      .toContain("$c[\"$flow\"]");
  });

  test("a bare flow, without $, is a member of the component", () => {
    const text = checkFileOf([page("<p>{{ flow(1) }}</p>")], outputFile);
    expect(text)
      .toContain("($c[\"flow\"])(1)");
  });

  test("a property of a value (not the component) is read as written, optionally", () => {
    const text = checkFileOf([page("<p>{{ items().length }}{{ items()?.length }}</p>")], outputFile);
    expect(text)
      .toContain("(($c[\"items\"])())[\"length\"]");
    expect(text)
      .toContain("(($c[\"items\"])())?.[\"length\"]");
  });

  test("the operators, literals, objects and arrays are written as JavaScript", () => {
    const text = checkFileOf(
      [page("<p>{{ a ? 1 : 2 }}{{ !a }}{{ -count }}{{ 'x' + 'y' }}{{ [1, 2] }}{{ { k: 'v' } }}{{ undefined }}</p>")],
      outputFile,
    );
    expect(text)
      .toContain("(($c[\"a\"]) ? (1) : (2))");
    expect(text)
      .toContain("void (!($c[\"a\"]));");
    expect(text)
      .toContain("void (-($c[\"count\"]));");
    expect(text)
      .toContain("void ((\"x\" + \"y\"));");
    expect(text)
      .toContain("void ([1, 2]);");
    expect(text)
      .toContain("void (({ \"k\": \"v\" }));");
    expect(text)
      .toContain("void (undefined);");
  });

  test("a reference of an element is visible after it, and its children are in their own block", () => {
    const text = checkFileOf([page("<input #box><p>{{ box }}</p>{{ box }}")], outputFile);
    expect(text)
      .toContain("const box: any = undefined;");
    expect(text)
      .toContain("void (box);");
  });

  test("a template declaration's name is visible, and its let- names are any", () => {
    const text = checkFileOf([page("<template #row let-cell><p>{{ cell }}</p></template>{{ row }}")], outputFile);
    expect(text)
      .toContain("const row: any = undefined;");
    expect(text)
      .toContain("const cell: any = undefined;");
  });

  test("a @match checks its subject, and each case's guard and body, and its default", () => {
    const text = checkFileOf([page("@match count { @case 1 when ready { one } @default { other } }")], outputFile);
    expect(text)
      .toContain("void ($c[\"count\"]);");
    expect(text)
      .toContain("void ($c[\"ready\"]);");
  });

  test("a @case with no when has a body checked, and no guard", () => {
    const text = checkFileOf([page("@match count { @case 1 { one } }")], outputFile);
    expect(text)
      .toContain("void ($c[\"count\"]);");
    expect(text)
      .toContain("{");
  });

  test("a @match with no subject, and with no default, checks its cases alone", () => {
    const text = checkFileOf([page("@match { @case _ when ready { one } }")], outputFile);
    expect(text)
      .toContain("void ($c[\"ready\"]);");
  });

  test("bindings of an element are checked: its attributes, classes, styles and inputs", () => {
    const text = checkFileOf(
      [page("<p [class.done]=\"done\" [style.color]=\"color\" [attr.role]=\"role\"></p>")],
      outputFile,
    );
    expect(text)
      .toContain("void ($c[\"done\"]);");
    expect(text)
      .toContain("void ($c[\"color\"]);");
    expect(text)
      .toContain("void ($c[\"role\"]);");
  });

  test("a slot checks nothing", () => {
    const text = checkFileOf([page("<slot></slot>")], outputFile);
    expect(text)
      .toContain("export function check_Page");
    expect(text)
      .not
      .toContain("void (");
  });
});

/** TypeScript's own library files, read once for all the programs below. */
const libraryFiles = new Map<string, ts.SourceFile | undefined>();

/**
 * The errors TypeScript reports for a component's file and the check of its template, both kept
 * in memory: the component is `Page`, in `/app/page.ts`.
 */
function typeErrorsOf(component: string, template: string): string[] {
  const files = new Map([
    ["/app/page.ts", component],
    [outputFile, checkFileOf([page(template)], outputFile)],
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    lib: ["lib.es2022.d.ts"],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version) => {
    const text = files.get(name);
    if (text !== undefined) {
      return ts.createSourceFile(name, text, version);
    }
    if (!libraryFiles.has(name)) {
      libraryFiles.set(name, getSourceFile(name, version));
    }
    return libraryFiles.get(name);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => files.has(name) || fileExists(name);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => files.get(name) ?? readFile(name);
  host.directoryExists = (name) => name === "/app" || ts.sys.directoryExists(name);
  const program = ts.createProgram([outputFile], options, host);
  return ts.getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

describe("the check of a @map, compiled by TypeScript", () => {
  const component = `export class Page {
    todos(): readonly { id: number; title: string; tags: string[] }[] { return []; }
    count(): number { return 0; }
    upper(text: string): string { return text; }
  }`;

  test("a template that reads what the items have compiles", () => {
    expect(typeErrorsOf(
      component,
      "@map todos(); let { title, tags: [first] }; track { id } { <p>{{ upper(title) }}{{ first }}</p> }",
    ))
      .toEqual([]);
  });

  test("a field the items do not have is an error, read or destructured", () => {
    expect(typeErrorsOf(component, "@map todos(); let todo { <p>{{ todo.nope }}</p> }"))
      .toEqual([expect.stringContaining("Property 'nope' does not exist")]);
    expect(typeErrorsOf(component, "@map todos(); let { nope } { <p>{{ nope }}</p> }"))
      .toEqual([expect.stringContaining("Property 'nope' does not exist")]);
  });

  test("an item passed where its type does not fit is an error", () => {
    expect(typeErrorsOf(component, "@map todos(); let { id } { <p>{{ upper(id) }}</p> }"))
      .toEqual([expect.stringContaining("'number' is not assignable to parameter of type 'string'")]);
  });

  test("a list that is not an array is an error", () => {
    expect(typeErrorsOf(component, "@map count(); let n { <p>{{ n }}</p> }"))
      .toContainEqual(expect.stringContaining("does not satisfy the expected type"));
  });

  test("a track field the items do not have is an error", () => {
    expect(typeErrorsOf(component, "@map todos(); let todo; track { nope } { <p>{{ todo.id }}</p> }"))
      .toEqual([expect.stringContaining("Property 'nope' does not exist")]);
  });
});
