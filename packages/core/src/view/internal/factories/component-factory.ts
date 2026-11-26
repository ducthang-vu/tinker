// The component factory: everything needed to turn a component class into a
// rendered ComponentView.
//
// Given a host element (or creating one from the component's selector), it
// creates the component's own injector (child of the engine's: its host
// directives, ElementRef, its own Effects and RenderHooks, and its and its host
// directives' `providers`, all destroyed with the view), creates the host
// directives then the component in it, parses its template (once per class), builds the
// DOM through the Renderer, attaches the resulting ComponentView to the host's
// ElementContext, and applies the component's host bindings (through the
// DirectiveFactory: a component is a directive with a template).
//
// Reactivity is per view, not per directive: every view gets ONE watch,
// destroyed with the view. It evaluates everything the template binds, in
// template order: today its `{{ }}` texts; later also the inputs of the
// directives on its elements, and their host bindings. Directives have no
// watch of their own, so a directive never runs before the parent has set
// its inputs. (Re-evaluating a whole view is cheap; only changed values
// touch the DOM.) The first run happens during `create`, so the view is
// complete when returned; later runs are queued in `changeDetection.views`.
//
// Signals are the only trigger: a view re-runs when a signal its watch read
// changes, and for no other reason (no zone, no re-run after listeners, no
// markForCheck). A plain field changed in a handler does not update the view:
// make it a signal. (Re-running a view after its listeners fire, as Angular
// does, could be added later without changing the rest.)
//
// Rendered so far: elements, plain attributes, text with `{{ }}`
// interpolations (see template/expression.ts for what expressions can do),
// and the directives and components the component imports, on the elements
// matching their selectors (see TemplateBuilder.createDirectivesAndComponents).
// A component in a template is created with this factory, in the injector of
// its element, and is owned by the parent's view; its element's input
// bindings (`[label]="…"`) set its inputs before its first render. Its
// element's children are its content: the component shows them in its
// `<slot>`s (see TemplateBuilder.build). A component may not contain itself,
// directly or through others.

import {
  inject,
  Injectable,
  Injector,
  type InjectorRef,
  provide,
  runInInjectionContext,
} from "../../../di/index.ts";
import type { ViewNode } from "../runtime/schedulers/view-scheduler.ts";
import { flatMap, type Either, Left, map, mapLeft, match, Right, sequence, valueOrThrow, Some, None, isSome, use, run, partial, toError } from "@tinker/functional";
import { watch } from "../../../signals/index.ts";
import { resolveForwardRef } from "../../../utils/forward-ref.ts";
import type { Class } from "../../../utils/types.ts";
import { type ComponentMetadata, getComponentMetadata } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { inputsOf } from "../authoring/input.ts";
import { endOutputs } from "../authoring/output.ts";
import { RenderHooks } from "../authoring/render-hooks.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { type ComponentView, ComponentViewFactory, type RenderScope } from "../runtime/component-view.ts";
import { currentClassOf, trackRoot } from "../hot-tracker.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";
import type { Binding } from "../runtime/text-binding.ts";
import type { AttributeNode } from "../template/ast.ts";
import { type CompiledNode, compileTemplate, type DirectiveCandidate } from "../template/compile.ts";
import { classesIn } from "../template/classes-in.ts";
import { registerTemplateFunctions } from "../template/template-functions.ts";
import { isTemplateFunction, templateFunctionMemoised, templateFunctionName, type TemplateFunctionContract } from "../authoring/template-function.ts";
import { memoisedCall } from "../template/template-memo.ts";
import { replaceClasses } from "../template/replace-classes.ts";
import { Selector } from "../template/selector.ts";
import { CLASS_REPLACEMENTS, DEV_MODE, RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
import { devChecks } from "../template/scope.ts";
import { BUILT_IN_NAMES } from "../template/built-in-functions.ts";
import { ElementScope } from "./element-scope.ts";
import { ElementPlacement } from "../runtime/placement.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import type { HostBindings } from "./host-bindings.ts";
import { type TemplateBuilder, TemplateBuilderFactory } from "./template-builder.ts";
import { ContentQueries, ViewQueries } from "../runtime/view-queries.ts";
import { applyComponentStyles } from "../runtime/component-styles.ts";
import type { View } from "../runtime/view.ts";

/**
 * A selector a host element can be created from: an optional tag, then an
 * optional `[attribute]`.
 */
const HOST_SELECTOR = /^([a-z][a-z0-9-]*)?(?:\[([^\]=\s]+)\])?$/i;

/**
 * How many components may be created inside each other. A component that contains itself stops
 * here, and its failure is contained like a child's. A recursive component (a tree) stops before
 * it, when its template does (with `@if`).
 */
const MAX_NESTING = 100;

/** Where a component in another component's template is: see ComponentFactory.create. */
/** What `create` has checked, and what building the component then needs. */
interface Prepared {
  readonly metadata: ComponentMetadata;
  readonly hostDirectives: readonly Class<object>[];
  /** The element the component is rendered into: given, or created from `plan`. */
  readonly target: HostTarget;
}

/** Where a component's host element comes from: an element it is given, or a new one. */
type HostTarget = { readonly element: Element } | { readonly plan: HostPlan };

/** A new host element: its tag, and the attribute its selector gives it, if any. */
interface HostPlan {
  readonly tag: string;
  readonly attribute: string | undefined;
}

/** The host element a selector creates: an optional tag, then an optional `[attribute]`. */
function hostPlanOf(type: Class<unknown>, selector: string): Either<HostPlan, Error> {
  const match = HOST_SELECTOR.exec(selector);
  return match !== null && (match[1] !== undefined || match[2] !== undefined)
    ? Right.of({ tag: match[1] ?? "div", attribute: match[2] })
    : Left.of(new Error(`Cannot create a host element for ${type.name} from selector "${selector}"`));
}

export interface ParentContext {
  readonly parentInjector: Injector;
  readonly parentView: View;
  /** The parent view's node: the child's view is owned by it, for the order of updates. */
  readonly node: ViewNode;
  /**
   * Takes the child's host bindings (its own and its host directives'): its
   * host element is in the parent's template, so the parent's watch updates
   * them, with the parent's own bindings on that element.
   */
  readonly adoptHostBindings: (bindings: readonly Binding[]) => void;
  /**
   * Sets the inputs of the new component, and of the directives on its element, from the
   * element: its plain attributes, then its input bindings (`[label]="…"`). Called before its
   * first render, so they have their first values.
   */
  readonly setInputs: (component: object) => void;
  /** The content of its element's children, by slot name, which its template's `<slot>`s show. */
  readonly projected: ReadonlyMap<string, Node[]>;
  /** The registry the parent records the element's projected children in, for `from: "content"`. */
  readonly contentQueries?: ContentQueries;
}

/** What a component's build has made so far: the boundary undoes it when the build fails. */
interface Staged {
  /** The component's own injector, once it is made. */
  injector?: InjectorRef;
  /** Its view, once it is made: destroying it undoes the rest, its injector included. */
  view?: { destroy(): void };
}

/** What a render of a component's template needs to be bound again: see `bindRender`. */
interface RenderParts<T extends object> {
  readonly type: Class<T>;
  readonly host: Element;
  readonly instance: T;
  readonly template: TemplateBuilder;
  readonly hostDirectives: readonly Class<object>[];
  readonly hostInstances: readonly object[];
  readonly ownInjector: InjectorRef;
  readonly node: ViewNode;
  /** Where the host element's bindings go: the parent's template if the component is in one. */
  readonly bindHost: (template: TemplateBuilder, bindings: Binding[]) => void;
}

@Injectable()
export class ComponentFactory {
  /** The components being created right now, outermost first: to detect recursion. */
  private readonly creating: Class<unknown>[] = [];
  private readonly parser = inject(TEMPLATE_PARSER);
  private readonly replacements = inject(CLASS_REPLACEMENTS);
  private readonly renderer = inject(RENDERER);
  private readonly devMode = inject(DEV_MODE);
  private readonly checks = this.devMode ? devChecks() : undefined;
  private readonly contexts = inject(ElementContexts);
  private readonly directives = inject(DirectiveFactory);
  private readonly builders = inject(TemplateBuilderFactory);
  private readonly elementScope = inject(ElementScope);
  private readonly views = inject(ComponentViewFactory);
  private readonly changeDetection = inject(ChangeDetection);
  private readonly injector = inject(Injector);
  /** Compiled templates, per component class: each template is parsed and compiled only once. */
  private readonly templates = new WeakMap<Class<unknown>, readonly CompiledNode[]>();

  /** The @Component metadata of `type`, or an error if it is not a component. */
  metadataOf(type: Class<unknown>): Either<ComponentMetadata, Error> {
    return match(getComponentMetadata(type), { Some: (metadata) => Right.of(metadata), None: () => Left.of(new Error(`${type.name} is not a component: decorate it with @Component`)) });
  }

  /**
   * Render component `type` into `host`. Without a host, a new (detached)
   * element is created from the component's selector: `tk-child` gives
   * `<tk-child>`, `[child]` gives `<div child>`, `tk-child[x]` gives `<tk-child x>`.
   *
   * For a component inside another's template, `child` says where it is: its
   * injector's parent, the view that owns it (destroying that view destroys
   * it), and the plain attributes of its element, bound to its inputs before
   * its first render. Fails, before anything is created, if a component contains
   * itself, if the host already holds a component, or if a host directive is not a
   * directive (or is a component).
   */
  create<T extends object>(
    declared: Class<T>,
    host?: Element,
    child?: ParentContext,
    parentInjector?: Injector,
    owner?: ViewNode,
  ): Either<ComponentView<T>, Error> {
    // After a hot update, the class a module declared is replaced by the new one.
    const type = currentClassOf(declared);
    if (this.creating.length >= MAX_NESTING) {
      const path = [...this.creating.slice(-3), type].map((creating) => creating.name)
        .join(" → ");
      return Left.of(new Error(`${type.name} is nested more than ${MAX_NESTING} components deep: ... → ${path}`));
    }
    return flatMap(this.prepare(type, host), (prepared) =>
      this.createPrepared(type, prepared, child, parentInjector, owner));
  }

  /** The checks `create` makes before it has any side effect. */
  private prepare(type: Class<unknown>, host: Element | undefined): Either<Prepared, Error> {
    return flatMap(this.metadataOf(type), (metadata) =>
      this.prepareWith(type, metadata, host));
  }

  private prepareWith(
    type: Class<unknown>,
    metadata: ComponentMetadata,
    host: Element | undefined,
  ): Either<Prepared, Error> {
    return flatMap(this.hostDirectivesOf(type, metadata), (hostDirectives) =>
      flatMap(this.hostsOf(type, metadata, hostDirectives), () =>
        this.withTarget(type, metadata, hostDirectives, host)));
  }

  /**
   * The parsed `host` options of `type`, its host directives, and every directive
   * and component its template names: an invalid one fails before anything is created.
   */
  private hostsOf(
    type: Class<unknown>,
    metadata: ComponentMetadata,
    hostDirectives: readonly Class<object>[],
  ): Either<readonly HostBindings[], Error> {
    const templateClasses = this.classesInTemplates(type, metadata, new Set());
    return sequence([type, ...hostDirectives, ...templateClasses]
      .map((directive) => this.directives.hostOf(directive)));
  }

  /**
   * The classes named by the template of `type`, and by the templates of the
   * components it names, at any depth: a component's template is built while its
   * parent's is, so it is checked now too. `seen` stops at a cycle (the cycle is
   * reported when such a component is created).
   */
  private classesInTemplates(
    type: Class<unknown>,
    metadata: ComponentMetadata,
    seen: Set<Class<unknown>>,
  ): Class<object>[] {
    seen.add(type);
    return classesIn(this.templateOf(type, metadata))
      .flatMap((klass) =>
        match(getComponentMetadata(klass), {
          Some: (childMetadata) => seen.has(klass)
            ? [klass]
            : [klass, ...this.classesInTemplates(klass, childMetadata, seen)],
          None: () => [klass],
        }));
  }

  /** The host: the element given, if it holds no component yet, or else a plan for a new one. */
  private withTarget(
    type: Class<unknown>,
    metadata: ComponentMetadata,
    hostDirectives: readonly Class<object>[],
    host: Element | undefined,
  ): Either<Prepared, Error> {
    if (host === undefined) {
      return map(hostPlanOf(type, metadata.selector), (plan): Prepared => ({
        metadata,
        hostDirectives,
        target: { plan },
      }));
    }
    return this.hostNotHoldingComponent(type, host, {
      metadata,
      hostDirectives,
      target: { element: host },
    });
  }

  /** `prepared` when `host` holds no component yet. */
  private hostNotHoldingComponent(
    type: Class<unknown>,
    host: Element,
    prepared: Prepared,
  ): Either<Prepared, Error> {
    const holds = isSome(flatMap(this.contexts.get(host), (existing) => existing.componentView));
    return holds
      ? Left.of(new Error(`The host element of ${type.name} already holds a component`))
      : Right.of(prepared);
  }

  /**
   * Creates `type` once `create` has checked it: it is on the cycle path while it is built.
   * This is the one boundary of a component's failure. A throw from anywhere in its build
   * (its constructor, its template, its directives) is a Left here, so the component that
   * failed is the only one lost: its parent decides what its element shows.
   */
  private createPrepared<T extends object>(
    type: Class<T>,
    prepared: Prepared,
    child: ParentContext | undefined,
    parentInjector: Injector | undefined,
    owner: ViewNode | undefined,
  ): Either<ComponentView<T>, Error> {
    const staged: Staged = {};
    this.creating.push(type);
    try {
      return Right.of(this.createView(type, prepared, child, parentInjector, owner, staged));
    } catch (error) {
      // Undoes what was made before the failure: the view destroys its injector too.
      if (staged.view !== undefined) {
        staged.view.destroy();
      } else {
        staged.injector?.destroy();
      }
      return Left.of(toError(error));
    } finally {
      this.creating.pop();
    }
  }

  private createView<T extends object>(
    type: Class<T>,
    { metadata, hostDirectives, target }: Prepared,
    child: ParentContext | undefined,
    parentInjector: Injector | undefined,
    owner: ViewNode | undefined,
    staged: Staged,
  ): ComponentView<T> {
    const host = "element" in target ? target.element : this.createHost(target.plan);

    // Its own injector, child of the engine's (or, for a component in another's
    // template, of the injector of its element): its host directives, the
    // component itself, its host element (ElementRef), its own Effects and
    // RenderHooks (so what it registers through them stops when it is
    // destroyed), then the component's and its host directives' providers
    // (after, so they cannot replace the others).
    // The component is created in it, so its inject() calls resolve there first.
    /** Cleanups of what a root component's element holds: run when its view is destroyed. */
    const rootCleanups: (() => void)[] = [];
    // Owned by the parent view of the element, or by the view a container was attached to.
    const node: ViewNode = { owner: child?.node ?? owner };
    const ownInjector = Injector.create({
      providers: [
        ...hostDirectives,
        type,
        ViewQueries,
        provide(ContentQueries, { useValue: child?.contentQueries ?? new ContentQueries() }),
        ...this.elementScope.providers(
          new ElementPlacement(host),
          () => ownInjector.injector,
          // Inside a template, the containers go with the parent's view; a root component
          // has none, so they go with its own view, which is made after its constructor.
          child?.parentView ?? {
            addDestroyCallback: (callback) => rootCleanups.push(callback),
            node,
          },
        ),
        ...(metadata.providers ?? []),
        // The template functions it imports, created in its injector like its providers.
        ...this.templateFunctionTypesOf(metadata)
          .values(),
        ...hostDirectives.flatMap((directive) =>
          valueOrThrow(this.directives.metadataOf(directive)).providers ?? []),
      ],
      parent: child?.parentInjector ?? parentInjector ?? this.injector,
    });
    staged.injector = ownInjector;
    const projected = child?.projected ?? new Map<string, Node[]>();
    const { instance, hostInstances, rendered, template, queries } = this.createAndBuild(
      type,
      metadata,
      hostDirectives,
      ownInjector,
      projected,
      node,
    );
    for (const node of rendered) {
      this.renderer.appendChild(host, node);
    }

    // The styles are applied last, so that nothing above can fail after they are counted.
    const releaseStyles = applyComponentStyles(this.renderer, type, host);
    const view = this.views.create(host, instance, rendered, node);
    staged.view = view;
    view.addDestroyCallback(releaseStyles);
    view.addDestroyCallback(() => ownInjector.destroy());
    view.addDestroyCallback(() => rootCleanups.forEach((cleanup) => cleanup()));
    // Its outputs are over when it is: the templates subscribed to them are told.
    view.addDestroyCallback(partial(endOutputs, instance));
    // What the template renders (its watch, directives, child components) goes in a render scope.
    const render = view.renderScope();
    // The component's inputs live on its own view: `view.setInput` binds them.
    view.addInputs(instance, inputsOf(instance));
    // In a template: the element's inputs are set (attributes, then bindings), before it renders.
    child?.setInputs(instance);
    // What the template renders, bound in the render scope (see bindRender). A root component's
    // view can render its template again, from the same instance.
    const parts: RenderParts<T> = {
      type,
      host,
      instance,
      template,
      hostDirectives,
      hostInstances,
      ownInjector,
      node,
      bindHost: (current, bindings) => {
        if (child) {
          child.adoptHostBindings(bindings);
        } else {
          current.addBindings(bindings);
        }
      },
    };
    this.bindRender(render, parts);
    if (child === undefined) {
      // `next` is the class the instance's module now declares, after a hot update: its template
      // is the one rendered, and the instance (and its state) is kept.
      view.setRerender((next) => {
        const target = (next ?? type) as Class<T>;
        const targetMetadata = valueOrThrow(this.metadataOf(target));
        view.destroyRender();
        const current = this.builders.create(instance, this, queries, undefined, true, node);
        view.replaceNodes(current.build(this.templateOf(target, targetMetadata), projected));
        this.bindRender(view.renderScope(), { ...parts, template: current });
      });
    }
    // Every view is tracked: a component whose live views cannot render again is reloaded.
    trackRoot(type, view);
    // Only now, so a failed create leaves no context behind.
    const context = this.contexts.getOrCreate(host);
    context.attachComponent(view);
    view.addDestroyCallback(() => {
      context.detachComponent();
      this.contexts.forgetIfEmpty(context);
    });
    // Its element is in the parent's template: the parent's view destroys it.
    child?.parentView.addElement(context);
    return view;
  }

  /**
   * Bind what a render of the template creates, into `scope`: the host directives on the host
   * element, the template's directives and child components, and the bindings of the host element
   * and of the template. The view's watch comes last: its first run makes the view complete.
   */
  private bindRender<T extends object>(scope: RenderScope, parts: RenderParts<T>): void {
    const { host, instance, type, template } = parts;
    const { hostDirectives, hostInstances, ownInjector, node } = parts;
    const hostBindings = hostDirectives.flatMap((directive, i) =>
      this.directives.attach(directive, hostInstances[i]!, host, scope));
    // In a template: its element's input bindings, then the directives and child components of
    // its own template's elements, now that its view exists, and before the first render.
    template.createDirectivesAndComponents(scope, ownInjector.injector);
    // Its own host bindings: listeners now. The class bindings belong to whichever view contains
    // its host element (see `bindHost`).
    hostBindings.push(...this.directives.applyHost(type, instance, host, scope));
    parts.bindHost(template, hostBindings);
    // The first render waits for the next tick, after the caller has bound the inputs (see
    // `create`). Effects of that tick run before the views, so an effect sees them too.
    const viewWatch = watch(() => template.update(), this.changeDetection.views.forNode(node));
    scope.addDestroyCallback(() => viewWatch.destroy());
  }

  /**
   * Create the instance in `ownInjector`, and build its template. A failure is thrown: the
   * boundary in `createPrepared` undoes what was made.
   */
  private createAndBuild<T extends object>(
    type: Class<T>,
    metadata: ComponentMetadata,
    hostDirectives: readonly Class<object>[],
    ownInjector: InjectorRef,
    projected: ReadonlyMap<string, Node[]>,
    node: ViewNode,
  ): {
    instance: T;
    hostInstances: object[];
    rendered: Node[];
    template: TemplateBuilder;
    queries: ViewQueries;
  } {
    // Host directives first, in order, so the component can inject them.
    // The component is a provider of its injector too: created by it (so
    // its onDestroy() runs with the view), and injectable below it.
    const { hostInstances, instance, templateFunctions } = runInInjectionContext(
      ownInjector.injector,
      () => ({
        hostInstances: hostDirectives.map((directive) => inject(directive)),
        instance: inject(type),
        templateFunctions: [...this.templateFunctionTypesOf(metadata)].map(([name, fnType]) => {
          const fn = inject(fnType) as TemplateFunctionContract;
          const contract: TemplateFunctionContract = templateFunctionMemoised(fnType)
            ? {
                call: memoisedCall((...args) => fn.call(...args), this.checks, `${type.name}.${name}`),
              }
            : fn;
          return [name, contract] as const;
        }),
      }),
    );
    registerTemplateFunctions(instance, new Map(templateFunctions));
    // The build stops a member that hides an imported template function when it can read the
    // class. Here, in development mode, a member that got past the build is only a warning.
    if (this.devMode) {
      for (const name of BUILT_IN_NAMES) {
        if (name in instance) {
          this.checks?.warn(`${type.name} has a member named "${name}", which hides the built-in template function ${name}`);
        }
      }
    }
    for (const [name] of templateFunctions) {
      if (name in instance) {
        this.checks?.warn(`${type.name} has a member named "${name}", which hides the template function imported as "${name}"`);
      }
    }
    // The builder creates the template's child components with this factory.
    const queries = runInInjectionContext(ownInjector.injector, () => inject(ViewQueries));
    const template = this.builders.create(instance, this, queries, undefined, true, node);
    const rendered = template.build(this.templateOf(type, metadata), projected);
    return { instance, hostInstances, rendered, template, queries };
  }

  /** Create the host element `plan` describes. */
  private createHost({ tag, attribute }: HostPlan): Element {
    const host = this.renderer.createElement(tag);
    if (attribute) {
      this.renderer.setAttribute(host, attribute, "");
    }
    return host;
  }

  /** The host directives of `type`: an error for one that is not a directive, or is a component. */
  private hostDirectivesOf(
    type: Class<unknown>,
    metadata: ComponentMetadata,
  ): Either<readonly Class<object>[], Error> {
    const hostDirectives = metadata.hostDirectives ?? [];
    return map(
      sequence(hostDirectives.map((directive) => this.hostDirectiveOf(type, directive))),
      () => hostDirectives,
    );
  }

  private hostDirectiveOf(
    type: Class<unknown>,
    directive: Class<object>,
  ): Either<Class<object>, Error> {
    return flatMap(this.directives.metadataOf(directive), () =>
      match(getComponentMetadata(directive), { Some: () => Left.of<Error, Class<object>>(new Error(`${directive.name} is a component: it cannot be a host directive of ${type.name}`)), None: () => Right.of<Class<object>, Error>(directive) }));
  }

  /**
   * The compiled template of `type`, its elements matched against the
   * directives it imports: compiled on first use, then cached per class.
   * A precompiled tree names the real classes, so CLASS_REPLACEMENTS is applied to it.
   */
  private templateOf(type: Class<unknown>, metadata: ComponentMetadata): readonly CompiledNode[] {
    let nodes = this.templates.get(type);
    if (!nodes) {
      nodes = typeof metadata.template === "string"
        ? this.compileSource(metadata.template, type, metadata)
        : replaceClasses(metadata.template, (declared) =>
            this.replacements.get(declared) ?? declared);
      this.templates.set(type, nodes);
    }
    return nodes;
  }

  /**
   * The template source, parsed and compiled. A syntax error is thrown here: this is where the
   * factory still throws, until it returns its errors as values.
   */
  private compileSource(
    source: string,
    type: Class<unknown>,
    metadata: ComponentMetadata,
  ): readonly CompiledNode[] {
    return match(this.parser.parse(source), {
      Right: (parsed) => valueOrThrow(compileTemplate(parsed, this.candidatesOf(type, metadata))),
      Left: (error) => {
        throw error;
      },
    });
  }

  /**
   * The template functions `metadata` imports, by the name their template calls them by. Two
   * imports with the same name are an error.
   */
  private templateFunctionTypesOf(metadata: ComponentMetadata): Map<string, Class<object>> {
    const types = new Map<string, Class<object>>();
    for (const entry of metadata.imports ?? []) {
      const declared = resolveForwardRef(entry);
      use(templateFunctionName(declared), {
        Some: (name) => {
          if (BUILT_IN_NAMES.includes(name)) {
            throw new Error(`${name} is a built-in template function: an import cannot take its name`);
          }
          if (types.has(name)) {
            throw new Error(`${name} is imported twice as a template function`);
          }
          types.set(name, declared);
        },
        None: () => undefined,
      });
    }
    return types;
  }

  /**
   * The directives `type` imports, with their parsed selectors. Throws for
   * one that is not a directive, or whose selector is not supported.
   */
  private candidatesOf(type: Class<unknown>, metadata: ComponentMetadata): DirectiveCandidate[] {
    return (metadata.imports ?? [])
      .filter((declared) => !isTemplateFunction(resolveForwardRef(declared)))
      .map((declared) => {
        const resolved = resolveForwardRef(declared);
        const imported = this.replacements.get(resolved) ?? resolved;
        const metadata = valueOrThrow(this.directives.metadataOf(imported));
        return {
          type: imported,
          selector: valueOrThrow(mapLeft(Selector.parse(metadata.selector), (error) => new Error(`${imported.name}, imported by ${type.name}: ${error.message}`))),
          isComponent: isSome(getComponentMetadata(imported)),
          exportAs: metadata.exportAs,
        };
      });
  }
}
