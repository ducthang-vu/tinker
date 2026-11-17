// Errors thrown by the reactive graph.

/** Thrown when a signal is written while a consumer that forbids writes is running. */
export class SignalWriteError extends Error {
  constructor() {
    super("Writing to signals is not allowed here (for example, inside a computed)");
    this.name = "SignalWriteError";
  }
}

/** Thrown when a computed is read while it is computing: a cycle in the graph. */
export class SignalCycleError extends Error {
  constructor() {
    super("Detected a cycle in computeds: a computed depends on itself");
    this.name = "SignalCycleError";
  }
}

/** Thrown when a watch keeps changing its own dependencies (probably an endless loop). */
export class WatchLoopError extends Error {
  constructor(maxReruns: number) {
    super(`A watch re-ran ${maxReruns} times in a row: it probably writes a signal it reads`);
    this.name = "WatchLoopError";
  }
}
