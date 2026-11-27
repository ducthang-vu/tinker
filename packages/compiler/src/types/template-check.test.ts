import { describe, expect, test } from "vitest";
import { resolve } from "node:path";
import ts from "typescript";
import { compileSource, type CompiledNode, type ImportedSelector } from "@tinker/core/compiler";
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
  directives: [],
});

const outputFile = "/app/page.template-check.ts";

/** A directive of `/app/dirs.ts`, as a check reads it. */
const directive = (
  className: string,
  selector: string,
  members: readonly string[],
  options: { exportAs?: string; isComponent?: boolean; allMembers?: boolean } = {},
) => ({ className, selector, members, ...options });

/**
 * A page whose template uses `directives`, compiled as the plugin compiles it: each directive is a
 * placeholder class named as the page imports it.
 */
function pageWith(
  template: string,
  directives: readonly ReturnType<typeof directive>[],
): CheckedTemplate {
  const selectors: ImportedSelector[] = directives.map((info) => ({
    selector: info.selector,
    isComponent: info.isComponent ?? false,
    type: Object.defineProperty(class {}, "name", { value: info.className }),
    ...(info.exportAs === undefined ? {} : { exportAs: info.exportAs }),
  }));
  return {
    ...page("<p></p>"),
    nodes: valueOrThrow(compileSource(template, selectors)),
    directives: directives.map((info) => ({
      name: info.className,
      className: info.className,
      file: "/app/dirs.ts",
      selector: info.selector,
      members: info.members,
      allMembers: info.allMembers ?? true,
      ...(info.exportAs === undefined ? {} : { exportAs: info.exportAs }),
    })),
  };
}

/** The type a check file declares `name` with: what follows `const name = null as never as`. */
function typeOf(text: string, name: string): string {
  const line = text.split("\n")
    .find((current) => current.trim()
      .startsWith(`const ${name} = null as never as `));
  return line === undefined
    ? ""
    : line.trim()
        .slice(`const ${name} = null as never as `.length, -1);
}

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
      directives: [],
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
      .toContain("const todo = null as never as (typeof $list)[number];");
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
    const row = "$Keys<$Narrow<(typeof $list)[number], { \"tags\": readonly [unknown, ...unknown[]] }>, \"id\" | \"tags\", never>";
    const tags = `$Narrow<(${row})["tags"], readonly [unknown, ...unknown[]]>`;
    expect(typeOf(text, "id"))
      .toBe(`(${row})["id"]`);
    expect(typeOf(text, "first"))
      .toBe(`(${tags})[0]`);
    expect(typeOf(text, "others"))
      .toBe(`(${tags})[number][]`);
    expect(text)
      .toContain("type $Narrow<S, P> = S extends P ? S : S & P;");
    expect(text)
      .toContain("type $Keys<S, K, A> =");
  });

  test("an array pattern with no rest binds only its items", () => {
    const text = checkFileOf([page("@map pairs(); let [a, b] { <p>{{ a }}{{ b }}</p> }")], outputFile);
    expect(text)
      .toContain("const b = null as never as ($Narrow<(typeof $list)[number], readonly [unknown, unknown]>)[1];");
  });

  test("a name given with as has the type of what it names, and so does the inner pattern's", () => {
    const text = checkFileOf([page("@map rows(); let { id } as row { <p>{{ id }}{{ row }}</p> }")], outputFile);
    expect(typeOf(text, "row"))
      .toBe("$Narrow<(typeof $list)[number], object>");
    expect(typeOf(text, "id"))
      .toBe("($Keys<$Narrow<(typeof $list)[number], object>, \"id\", never>)[\"id\"]");
  });

  test("a regex group is a string or undefined, and a literal field binds nothing", () => {
    const text = checkFileOf(
      [page("@map rows(); let { code: /(?<digits>\\d+)/, kind: \"a\" } { <p>{{ digits }}</p> }")],
      outputFile,
    );
    expect(text)
      .toContain("const digits = null as never as string | undefined;");
    expect(text)
      .not
      .toContain("const kind");
    expect(text)
      .not
      .toContain("@tinker/functional");
  });

  test("some, ok and error read the value of a Some, a Right and a Left, through helpers", () => {
    const text = checkFileOf(
      [page("@map rows(); let { a: some(x), b: ok(y), c: error(z) } { <p>{{ x }}{{ y }}{{ z }}</p> }")],
      outputFile,
    );
    const row = "$Keys<$Narrow<(typeof $list)[number], object>, \"a\" | \"b\" | \"c\", never>";
    expect(typeOf(text, "x"))
      .toBe(`$Some<(${row})["a"]>`);
    expect(typeOf(text, "y"))
      .toBe(`$Ok<(${row})["b"]>`);
    expect(typeOf(text, "z"))
      .toBe(`$Error<(${row})["c"]>`);
    expect(text)
      .toContain("import type { Left as $LeftCase, Right as $RightCase, Some as $SomeCase } from \"@tinker/functional\";");
    expect(text)
      .toContain("type $Some<T> = T extends $SomeCase<infer V> ? V : never;");
  });

  test("a name of an alternative is the union of what each option binds it to", () => {
    const text = checkFileOf(
      [page("@map rows(); let { value: ok(v) | error(v) } { <p>{{ v }}</p> }")],
      outputFile,
    );
    const field = "($Keys<$Narrow<(typeof $list)[number], object>, \"value\", never>)[\"value\"]";
    expect(typeOf(text, "v"))
      .toBe(`($Ok<${field}>) | ($Error<${field}>)`);
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
    expect(typeOf(text, "box"))
      .toBe("$Element<\"input\">");
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
      .toContain("const $subject = $c[\"count\"];");
    expect(text)
      .toContain("void ($c[\"ready\"]);");
  });

  test("a @case with no when has a body checked, and no guard", () => {
    const text = checkFileOf([page("@match count { @case 1 { one } }")], outputFile);
    expect(text)
      .toContain("const $subject = $c[\"count\"];");
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

  test("a reference to an element is typed by its tag, and a handler's $event by its DOM event", () => {
    const text = checkFileOf([page("<input #box (input)=\"go($event, box)\">")], outputFile);
    expect(typeOf(text, "box"))
      .toBe("$Element<\"input\">");
    expect(typeOf(text, "$event"))
      .toBe("$DomEvent<\"input\">");
    expect(text)
      .toContain("void (($c[\"go\"])($event, box));");
    expect(text)
      .toContain("type $Element<N> =");
    expect(text)
      .toContain("type $DomEvent<N> =");
  });

  test("a handler listening to outputs reads them from the directives, the DOM event as the fallback", () => {
    const text = checkFileOf([pageWith(
      "<b pick (picked)=\"go($event)\" (valueChange)=\"go($event)\" (click)=\"go($event)\"></b>",
      [directive("Pick", "[pick]", ["picked", "value", "click"])],
    )], outputFile);
    expect(text)
      .toContain("import { Pick as $cls_0 } from \"./dirs.ts\";");
    expect(text)
      .toContain("const $dir_0 = null as never as InstanceType<typeof $cls_0>;");
    expect(text)
      .toContain("const $output_0 = $emitted($dir_0[\"picked\"]);");
    expect(text)
      .toContain("const $output_0 = $changed($dir_0[\"value\"]);");
    expect(text)
      .toContain("const $output_0 = $emitted($dir_0[\"click\"]);");
    expect(typeOf(text, "$event"))
      .toBe("$Or<typeof $output_0, $DomEvent<\"picked\">>");
    expect(text)
      .toContain("declare function $emitted<V>(output: V): V extends $Output<infer T> ? T : never;");
    expect(text)
      .toContain("declare function $changed<V>(model: V): V extends $ModelSignal<infer T> ? T : never;");
  });

  test("a qualified handler reads only its owner's output, or the DOM event it falls back to", () => {
    const text = checkFileOf([pageWith(
      "<b pick other (pick.picked)=\"go($event)\" (keydown.enter)=\"go($event)\" (pick.gone)=\"go($event)\"></b>",
      [directive("Pick", "[pick]", ["picked"]), directive("Other", "[other]", ["picked"])],
    )], outputFile);
    const events = text.split("\n")
      .filter((line) => line.includes("const $event"))
      .map((line) => line.trim());
    expect(events)
      .toEqual([
        "const $event = null as never as $Or<typeof $output_0, never>;",
        "const $event = null as never as $DomEvent<\"keydown\">;",
        "const $event = null as never as never;",
      ]);
    expect(text)
      .not
      .toContain("$dir_1[\"picked\"]");
  });

  test("a directive whose base classes are not read types its own outputs, and leaves the others any", () => {
    const text = checkFileOf([pageWith(
      "<b pick (picked)=\"go($event)\" (inherited)=\"go($event)\"></b>",
      [directive("Pick", "[pick]", ["picked"], { allMembers: false })],
    )], outputFile);
    const events = text.split("\n")
      .filter((line) => line.includes("const $event"))
      .map((line) => line.trim());
    expect(events)
      .toEqual([
        "const $event = null as never as $Or<typeof $output_0, $DomEvent<\"picked\">>;",
        "const $event: any = undefined;",
      ]);
  });

  test("a reference to the component, or to an exportAs, is its instance", () => {
    const text = checkFileOf([pageWith(
      "<tk-card pick #p=\"picker\" ##card></tk-card>",
      [directive("Pick", "[pick]", [], { exportAs: "picker" }), directive("Card", "tk-card", [], { isComponent: true })],
    )], outputFile);
    expect(typeOf(text, "p"))
      .toBe("typeof $dir_0");
    expect(typeOf(text, "card"))
      .toBe("typeof $dir_1");
  });

  test("a range is a number, an as inside a field narrows as its pattern does, and {} is any object", () => {
    const text = checkFileOf(
      [page("@match value() { @case 0..9 as n { a } @case { tag: \"a\" as t } as all { b } @case {} as o { c }"
        + " @case { v: undefined, k: \"a\" | \"b\" } as u { d } @case falsy as f { e } }")],
      outputFile,
    );
    expect(typeOf(text, "u"))
      .toBe("$Narrow<typeof $subject, { \"v\": undefined; \"k\": \"a\" | \"b\" }>");
    expect(typeOf(text, "f"))
      .toBe("typeof $subject");
    expect(typeOf(text, "n"))
      .toBe("$Narrow<typeof $subject, number>");
    expect(typeOf(text, "all"))
      .toBe("$Narrow<typeof $subject, { \"tag\": \"a\" }>");
    expect(typeOf(text, "o"))
      .toBe("$Narrow<typeof $subject, object>");
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

/** The source of `@tinker/functional`, which a check reads `Maybe` and `Either` from. */
const functionalEntry = resolve("packages/functional/src/index.ts");

/** The source of `@tinker/core`, which a check reads `Output` and `ModelSignal` from. */
const coreEntry = resolve("packages/core/src/index.ts");

/** TypeScript's own library files, read once for all the programs below. */
const libraryFiles = new Map<string, ts.SourceFile | undefined>();

/**
 * The errors TypeScript reports for a component's file and the check of its template, both kept
 * in memory: the component is `Page`, in `/app/page.ts`.
 */
function typeErrorsOf(
  component: string,
  template: string | CheckedTemplate,
  extra: Readonly<Record<string, string>> = {},
): string[] {
  const checked = typeof template === "string" ? page(template) : template;
  const files = new Map([
    ["/app/page.ts", component],
    [outputFile, checkFileOf([checked], outputFile)],
    ...Object.entries(extra),
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: [],
    paths: { "@tinker/functional": [functionalEntry], "@tinker/core": [coreEntry] },
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
  // Only the files given are checked: the libraries they import are read, not checked.
  return [...files.keys()]
    .flatMap((name) => {
      const source = program.getSourceFile(name);
      return [
        ...program.getSyntacticDiagnostics(source),
        ...program.getSemanticDiagnostics(source),
      ];
    })
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

  test("an item whose type is a union keeps the whole union", () => {
    const mixed = `export class Page {
      values(): readonly (string | number)[] { return []; }
      upper(text: string): string { return text; }
    }`;
    expect(typeErrorsOf(mixed, "@map values(); let value { <p>{{ upper(value) }}</p> }"))
      .toEqual([expect.stringContaining("'string | number' is not assignable to parameter of type 'string'")]);
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

describe("the check of Maybe and Either items, compiled by TypeScript", () => {
  const component = `import type { Either, Maybe } from "@tinker/functional";
  export class Page {
    rows(): readonly { owner: Maybe<{ name: string }>; result: Either<number, Error> }[] { return []; }
    upper(text: string): string { return text; }
  }`;

  test("some, ok and error give the values of the cases, and an alternative their union", () => {
    expect(typeErrorsOf(
      component,
      "@map rows(); let { owner: some({ name }), result: ok(n) } { <p>{{ upper(name) }}{{ n + 1 }}</p> }",
    ))
      .toEqual([]);
    expect(typeErrorsOf(
      component,
      "@map rows(); let { result: error(e) } { <p>{{ e.message }}</p> }",
    ))
      .toEqual([]);
    expect(typeErrorsOf(
      component,
      "@map rows(); let { result: ok(v) | error(v) } { <p>{{ upper(v) }}</p> }",
    ))
      .toEqual([expect.stringContaining("'number | Error' is not assignable to parameter of type 'string'")]);
  });

  test("a field the Some's value does not have is an error", () => {
    expect(typeErrorsOf(component, "@map rows(); let { owner: some({ nope }) } { <p>{{ nope }}</p> }"))
      .toEqual([expect.stringContaining("Property 'nope' does not exist")]);
  });
});

describe("the check of @case bindings, compiled by TypeScript", () => {
  const component = `import type { Maybe } from "@tinker/functional";
  type Shape = { kind: "circle"; radius: number } | { kind: "square"; side: number };
  export class Page {
    shape(): Shape { return { kind: "circle", radius: 1 }; }
    value(): string | number { return 1; }
    owner(): { name: string } | null { return null; }
    maybe(): Maybe<{ name: string }> { return null as never; }
    upper(text: string): string { return text; }
    half(n: number): number { return n / 2; }
  }`;

  test("a literal field narrows a union to its case, and the names are read from it", () => {
    expect(typeErrorsOf(
      component,
      "@match shape() { @case { kind: \"circle\", radius } when radius > 0 { <p>{{ half(radius) }}</p> }"
      + " @case { kind: \"square\", side } { <p>{{ half(side) }}</p> } }",
    ))
      .toEqual([]);
  });

  test("a field the narrowed case does not have is an error", () => {
    expect(typeErrorsOf(component, "@match shape() { @case { kind: \"circle\", side } { <p>{{ side }}</p> } }"))
      .toEqual([expect.stringContaining("Property 'side' does not exist")]);
  });

  test("a typeof test narrows to its type, and present drops null", () => {
    expect(typeErrorsOf(
      component,
      "@match value() { @case string as text { <p>{{ upper(text) }}</p> } @case number as n { <p>{{ half(n) }}</p> } }"
      + "@match owner() { @case present as found { <p>{{ upper(found.name) }}</p> } }",
    ))
      .toEqual([]);
    expect(typeErrorsOf(component, "@match value() { @case number as n { <p>{{ upper(n) }}</p> } }"))
      .toEqual([expect.stringContaining("'number' is not assignable to parameter of type 'string'")]);
  });

  test("the keys an object pattern reads, and its absent keys, pick the cases that have them", () => {
    const outcome = `type Outcome = { value: number } | { error: string };
    export class Page {
      outcome(): Outcome { return { value: 1 }; }
      upper(text: string): string { return text; }
      half(n: number): number { return n / 2; }
    }`;
    expect(typeErrorsOf(
      outcome,
      "@match outcome() { @case { value, error: absent } { <p>{{ half(value) }}</p> } @case { error } { <p>{{ upper(error) }}</p> } }",
    ))
      .toEqual([]);
    expect(typeErrorsOf(outcome, "@match outcome() { @case { error } { <p>{{ half(error) }}</p> } }"))
      .toEqual([expect.stringContaining("'string' is not assignable to parameter of type 'number'")]);
    expect(typeErrorsOf(outcome, "@match outcome() { @case { nope } { <p>{{ nope }}</p> } }"))
      .toEqual([expect.stringContaining("Property 'nope' does not exist")]);
  });

  test("some reads the value of a Maybe subject", () => {
    expect(typeErrorsOf(component, "@match maybe() { @case some({ name }) { <p>{{ upper(name) }}</p> } }"))
      .toEqual([]);
  });
});

describe("the check of references and handlers, compiled by TypeScript", () => {
  const component = `export class Page {
    upper(text: string): string { return text; }
    half(n: number): number { return n / 2; }
  }`;
  const dirs = {
    "/app/dirs.ts": `import { model, output } from "@tinker/core";
    export class Pick {
      readonly picked = output<number>();
      private readonly gone = output<string>();
      readonly value = model<string>();
      label = "x";
    }`,
  };
  const pick = directive("Pick", "[pick]", ["picked", "gone", "value", "label"], { exportAs: "picker" });

  test("an element reference is its element type, and a DOM event its event type", () => {
    expect(typeErrorsOf(component, "<input #box (input)=\"upper(box.value)\">"))
      .toEqual([]);
    expect(typeErrorsOf(component, "<input #box (input)=\"half(box.value)\">"))
      .toEqual([expect.stringContaining("'string' is not assignable to parameter of type 'number'")]);
    expect(typeErrorsOf(component, "<button (click)=\"half($event)\"></button>"))
      .toEqual([expect.stringContaining("'PointerEvent' is not assignable to parameter of type 'number'")]);
  });

  test("an output's value is $event, private or not, and a model's change too", () => {
    expect(typeErrorsOf(
      component,
      pageWith("<b pick (picked)=\"half($event)\" (gone)=\"upper($event)\" (valueChange)=\"upper($event)\"></b>", [pick]),
      dirs,
    ))
      .toEqual([]);
    expect(typeErrorsOf(component, pageWith("<b pick (picked)=\"upper($event)\"></b>", [pick]), dirs))
      .toEqual([expect.stringContaining("'number' is not assignable to parameter of type 'string'")]);
  });

  test("a member that is not an output leaves the DOM event", () => {
    expect(typeErrorsOf(component, pageWith("<b pick (label)=\"half($event)\"></b>", [pick]), dirs))
      .toEqual([expect.stringContaining("'Event' is not assignable to parameter of type 'number'")]);
  });

  test("a reference to a directive by its exportAs is its instance", () => {
    expect(typeErrorsOf(component, pageWith("<b pick #p=\"picker\"></b>{{ upper(p.label) }}", [pick]), dirs))
      .toEqual([]);
    expect(typeErrorsOf(component, pageWith("<b pick #p=\"picker\"></b>{{ p.nope }}", [pick]), dirs))
      .toEqual([expect.stringContaining("Property 'nope' does not exist")]);
  });
});
