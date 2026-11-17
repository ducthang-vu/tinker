// @final: a class that cannot be subclassed.
//
// Subclassing lets a class override the methods that keep its guarantees
// (what registers and stops effects, for example). The decorator makes that
// fail at runtime: it returns a wrapper class whose constructor throws when
// it is not the class being created. A subclass instance calls the wrapper's
// constructor with `new.target` set to the subclass, so the check catches it
// before the real constructor runs.
//
// Apply it below `@Injectable()` (decorators run bottom up), so the injectable
// metadata is recorded on the class that dependency injection actually uses.

/** Any class, abstract or not, whatever its constructor parameters. */
type ClassLike = abstract new (...args: never[]) => object;

/** Class decorator: instances of the class can be created, but it cannot be subclassed. */
export function final<C extends ClassLike>(target: C, _context: ClassDecoratorContext<C>): C {
  const base = target as unknown as new (...args: unknown[]) => object;
  const name = base.name;
  const wrapper = class extends base {
    constructor(...args: unknown[]) {
      if (new.target !== wrapper) {
        throw new Error(`${name} is final: it cannot be subclassed`);
      }
      super(...args);
    }
  };
  Object.defineProperty(wrapper, "name", { value: name });
  return wrapper as unknown as C;
}
