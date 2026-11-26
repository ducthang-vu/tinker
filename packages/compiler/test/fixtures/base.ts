// Base classes a component extends: read by the compiler tests. Middle extends Base, so a
// component that extends Middle inherits Base's members too.
export class Base {
  title = "base";

  greet() {
    return "hi";
  }
}

export class Middle extends Base {}
