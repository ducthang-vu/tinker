// ElementRef: the element a directive or component is on, wrapped.
//
//   class Autofocus {
//     private readonly host = inject(ElementRef<HTMLInputElement>);
//     focus() {
//       this.host.nativeElement.focus();
//     }
//   }
//
// Change the element through the RENDERER (`renderer.addClass(element, …)`),
// which keeps a directive working with any render target. `nativeElement`
// is the way out, for what the renderer does not offer (focus, measuring):
// reading it says "this touches the platform directly". With another render
// target, it is whatever node that renderer uses.
//
// Provided in each element's injector, and in each component's (its host).

/** The element a directive or component is on. Inject it: `inject(ElementRef)`. */
export class ElementRef<T extends Element = Element> {
  /** @param nativeElement The underlying element (the framework creates ElementRefs). */
  constructor(readonly nativeElement: T) {}
}
