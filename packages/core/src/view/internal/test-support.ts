// Helpers for core's own tests. Not part of the public API.

/**
 * Wait for the next tick of the app's ticker, so the first render and any pending
 * change detection have run: `await tick()` after `bootstrap` or a write to a signal.
 */
export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));
