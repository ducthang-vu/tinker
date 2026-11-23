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
import { flatMap, type Either, Left, map, mapLeft, match, Right, sequence, valueOrThrow, Some, None, isSome, use, run, partial } from "@tinker/functional";
import { watch } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { type ComponentMetadata, getComponentMetadata } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { bindInputsToAttributes, inputsOf } from "../authoring/input.ts";
import { endOutputs } from "../authoring/output.ts";
import { RenderHooks } from "../authoring/render-hooks.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { type ComponentView, ComponentViewFactory } from "../runtime/component-view.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";
import type { Binding } from "../runtime/text-binding.ts";
import type { AttributeNode } from "../template/ast.ts";
import { type CompiledNode, compileTemplate, type DirectiveCandidate } from "../template/compile.ts";
import { replaceClasses } from "../template/replace-classes.ts";
import { Selector } from "../template/selector.ts";
import { CLASS_REPLACEMENTS, RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
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
  readonly attributes: readonly AttributeNode[];
  /**
   * Takes the child's host bindings (its own and its host directives'): its
   * host element is in the parent's template, so the parent's watch updates
   * them, with the parent's own bindings on that element.
   */
  readonly adoptHostBindings: (bindings: readonly Binding[]) => void;
  /**
   * Binds the input bindings of its element (`[label]="…"`) to the new
   * component (and the directives on that element): called before its
   * first render, so they have their first values.
   */
  readonly bindInputs: (component: object) => void;
  /** The content of its element's children, by slot name, which its template's `<slot>`s show. */
  readonly projected: ReadonlyMap<string, Node[]>;
  /** The registry the parent records the element's projected children in, for `from: "content"`. */
  readonly contentQueries?: ContentQueries;
}

@Injectable()
export class ComponentFactory {
  /** The components being created right now, outermost first: to detect recursion. */
  private readonly creating: Class<unknown>[] = [];
  private readonly parser = inject(TEMPLATE_PARSER);
  private readonly replacements = inject(CLASS_REPLACEMENTS);
  private readonly renderer = inject(RENDERER);
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
    type: Class<T>,
    host?: Element,
    child?: ParentContext,
    parentInjector?: Injector,
    owner?: ViewNode,
  ): Either<ComponentView<T>, Error> {
    const start = this.creating.indexOf(type);
    if (start !== -1) {
      const path = [...this.creating.slice(start), type].map((creating) => creating.name)
        .join(" → ");
      return Left.of(new Error(`${type.name} contains itself: ${path}`));
    }
    return map(this.prepare(type, host), (prepared) =>
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
      flatMap(this.hostsOf(type, hostDirectives), () =>
        this.withTarget(type, metadata, hostDirectives, host)));
  }

  /**
   * The parsed `host` options of `type` and its host directives: an invalid one
   * fails before anything is created.
   */
  private hostsOf(
    type: Class<unknown>,
    hostDirectives: readonly Class<object>[],
  ): Either<readonly HostBindings[], Error> {
    return sequence([type, ...hostDirectives]
      .map((directive) => this.directives.hostOf(directive)));
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

  /** Creates `type` once `create` has checked it: it is on the cycle path while it is built. */
  private createPrepared<T extends object>(
    type: Class<T>,
    prepared: Prepared,
    child: ParentContext | undefined,
    parentInjector: Injector | undefined,
    owner: ViewNode | undefined,
  ): ComponentView<T> {
    this.creating.push(type);
    try {
      return this.createView(type, prepared, child, parentInjector, owner);
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
        ...hostDirectives.flatMap((directive) =>
          valueOrThrow(this.directives.metadataOf(directive)).providers ?? []),
      ],
      parent: child?.parentInjector ?? parentInjector ?? this.injector,
    });
    const { instance, hostInstances, rendered, template } = this.createAndBuild(
      type,
      metadata,
      hostDirectives,
      ownInjector,
      child?.projected ?? new Map(),
      node,
    );
    for (const node of rendered) {
      this.renderer.appendChild(host, node);
    }

    // The styles are applied last, so that nothing above can fail after they are counted.
    const releaseStyles = applyComponentStyles(this.renderer, type, host);
    const view = this.views.create(host, instance, rendered, node);
    view.addDestroyCallback(releaseStyles);
    view.addDestroyCallback(() => ownInjector.destroy());
    view.addDestroyCallback(() => rootCleanups.forEach((cleanup) => cleanup()));
    // Its outputs are over when it is: the templates subscribed to them are told.
    view.addDestroyCallback(partial(endOutputs, instance));
    // The component's inputs live on its own view: `view.setInput` binds them.
    view.addInputs(instance, inputsOf(instance));
    // In a template: its element's plain attributes set its inputs, before it renders.
    bindInputsToAttributes(instance, child?.attributes ?? []);
    // Its host directives, on its host element (their host bindings: below).
    const hostBindings = hostDirectives.flatMap((directive, i) =>
      this.directives.attach(directive, hostInstances[i]!, host, view));
    // In a template: its element's input bindings, then the directives and
    // child components of its own template's elements, now that its view
    // exists, and before the first render.
    try {
      child?.bindInputs(instance);
      template.createDirectivesAndComponents(view, ownInjector.injector);
    } catch (error) {
      view.destroy(); // undoes the directives created so far, and the injectors
      throw error;
    }
    // Its own host bindings: listeners now. The class bindings (with its host
    // directives') belong to whichever view contains its host element: the
    // parent's for a component in a template, which updates them with its
    // own bindings on that element; its own view for a root component.
    hostBindings.push(...this.directives.applyHost(type, instance, host, view));
    if (child) {
      child.adoptHostBindings(hostBindings);
    } else {
      template.addBindings(hostBindings);
    }
    // The view's one watch: updates the bindings (the template's, then the
    // host bindings of its template's directives, and its own if it is a
    // root). Its first run happens now, so the view is complete when it is returned.
    // The first render waits for the next tick, after the caller has bound the inputs
    // (see `create`). Effects of that tick run before the views, so an effect sees them too.
    const viewWatch = watch(() => template.update(), this.changeDetection.views.forNode(node));
    view.addDestroyCallback(() => viewWatch.destroy());
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
   * Create the instance in `ownInjector`, and build its template. If either
   * fails, `ownInjector` is destroyed (no view exists yet to do it).
   */
  private createAndBuild<T extends object>(
    type: Class<T>,
    metadata: ComponentMetadata,
    hostDirectives: readonly Class<object>[],
    ownInjector: InjectorRef,
    projected: ReadonlyMap<string, Node[]>,
    node: ViewNode,
  ): { instance: T; hostInstances: object[]; rendered: Node[]; template: TemplateBuilder } {
    try {
      // Host directives first, in order, so the component can inject them.
      // The component is a provider of its injector too: created by it (so
      // its onDestroy() runs with the view), and injectable below it.
      const { hostInstances, instance } = runInInjectionContext(ownInjector.injector, () => ({
        hostInstances: hostDirectives.map((directive) => inject(directive)),
        instance: inject(type),
      }));
      // The builder creates the template's child components with this factory.
      const queries = runInInjectionContext(ownInjector.injector, () => inject(ViewQueries));
      const template = this.builders.create(instance, this, queries, undefined, true, node);
      const rendered = template.build(this.templateOf(type, metadata), projected);
      return { instance, hostInstances, rendered, template };
    } catch (error) {
      ownInjector.destroy();
      throw error;
    }
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
   * The directives `type` imports, with their parsed selectors. Throws for
   * one that is not a directive, or whose selector is not supported.
   */
  private candidatesOf(type: Class<unknown>, metadata: ComponentMetadata): DirectiveCandidate[] {
    return (metadata.imports ?? []).map((declared) => {
      const imported = this.replacements.get(declared) ?? declared;
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
