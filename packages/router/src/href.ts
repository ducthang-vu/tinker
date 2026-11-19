// The href of a routerlink: a string is the path as it is; an array is the segments of a path,
// each encoded, so "todos" and "7" give "/todos/7". Nothing to link to gives undefined.

export function hrefOf(to: string | readonly string[] | undefined): string | undefined {
  if (to === undefined) {
    return undefined;
  }
  if (typeof to === "string") {
    return to;
  }
  return `/${to.map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}
