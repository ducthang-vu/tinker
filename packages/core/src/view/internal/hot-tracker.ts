// The hooks hot reload uses in the component factory. Nothing is installed outside development
// (see hot.ts), so the factory's calls do nothing in a build.

/** A root component's view, as the hot reload sees it. */
export interface TrackedView {
  readonly destroyed: boolean;
  /** Whether it can render its template again: a root view can, one in a template cannot. */
  readonly renderable: boolean;
  /** Render its template again, from its instance, with `next`'s template (the class it now is). */
  rerender(next?: object): void;
}

/** What the hot reload provides once it is loaded. */
interface HotHooks {
  /** The class `type` is now, after the updates of its module (`type` itself if none). */
  currentOf(type: object): object;
  /** A root view of `type` was created: it is updated when `type`'s module changes. */
  track(type: object, view: TrackedView): void;
}

let hooks: HotHooks | undefined;

/** Install the hot reload's hooks. Called by the development-only entry. */
export function installHotHooks(installed: HotHooks): void {
  hooks = installed;
}

/** The class `type` is now: the one an update of its module gave, else `type`. */
export function currentClassOf<T extends object>(type: T): T {
  return (hooks?.currentOf(type) as T | undefined) ?? type;
}

/** Record a root view of `type`, so an update of its module can render it again. */
export function trackRoot(type: object, view: TrackedView): void {
  hooks?.track(type, view);
}
