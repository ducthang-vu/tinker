import { describe, expect, test } from "vitest";
import { inject, Injector, type InjectorRef, provide, runInInjectionContext } from "../../../di/index.ts";
import { DomRenderer } from "../renderer.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { ContainerPlacement, ElementPlacement, type Placement } from "../runtime/placement.ts";
import { RENDERER } from "../tokens.ts";
import { ElementScope } from "./element-scope.ts";

/** An element injector holding what `ElementScope` gives for `placement`. */
function elementInjectorFor(placement: Placement): Injector {
  const { injector: root } = Injector.create({
    providers: [provide(RENDERER, { useValue: new DomRenderer() }), ElementScope],
  });
  const scope = runInInjectionContext(root, () => inject(ElementScope));
  // The containers read the injector lazily, so it is needed only if one is injected.
  const created: InjectorRef = Injector.create({
    providers: scope.providers(placement, () => created.injector),
  });
  return created.injector;
}

describe("ElementScope", () => {
  test("an element placement gives its ElementRef, pointing at the element", () => {
    const element = document.createElement("p");
    const injector = elementInjectorFor(new ElementPlacement(element));
    const ref = runInInjectionContext(injector, () => inject(ElementRef));
    expect(ref.nativeElement)
      .toBe(element);
  });

  test("a container placement has no ElementRef, since it has no element", () => {
    const injector = elementInjectorFor(new ContainerPlacement(document.createComment("")));
    expect(() => runInInjectionContext(injector, () => inject(ElementRef)))
      .toThrow();
  });
});
