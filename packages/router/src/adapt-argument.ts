// AdaptArgument: a method decorator that converts one argument before the method body sees it. The
// body is written for one type, and the method's overload declares the wider type callers may pass:
//
//   class Router {
//     navigate(url: string | readonly string[]): void;
//     @AdaptArgument(0, joinSegments)
//     navigate(url: string): void { ... }   // url is always a string here
//   }
//
// The adapter receives the argument as the caller passed it and returns the one the body takes.

/** A method decorator that passes `adapt(args[index])` to the method in place of the argument. */
export function AdaptArgument<A, B>(index: number, adapt: (value: A) => B) {
  return <This, Args extends unknown[], R>(
    method: (this: This, ...args: Args) => R,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
  ): (this: This, ...args: Args) => R => {
    return function (this: This, ...args: Args): R {
      const adapted = args.map((arg, position) => (position === index ? adapt(arg as A) : arg));
      return method.apply(this, adapted as Args);
    };
  };
}
