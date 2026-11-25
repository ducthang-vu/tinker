// Template functions a component imports: read by the compiler tests. Two of them are named
// "format", so importing both is an error.
import { TemplateFunction } from "@tinker/core";

@TemplateFunction("format")
export class Format {
  call(n: number): string {
    return String(n);
  }
}

@TemplateFunction("format")
export class OtherFormat {
  call(n: number): string {
    return `${n}`;
  }
}

@TemplateFunction("shout")
export class Shout {
  call(s: string): string {
    return s.toUpperCase();
  }
}

// A template function whose name is not a literal: the build cannot read it.
const computed = String("dynamic");

@TemplateFunction(computed)
export class Dynamic {
  call(): number {
    return 1;
  }
}

// A template function named like the built-in flow: a component may not import it.
@TemplateFunction("flow")
export class Flowed {
  call(): number {
    return 1;
  }
}
