// A map from a key made of several parts to a value, where two keys are the
// same when each part is `===` the other's part. A JavaScript `Map` compares
// object keys by reference, so a key of several parts is looked up one part
// at a time, in a tree of maps.

interface Path<V> {
  readonly children: Map<unknown, Path<V>>;
  entry?: { readonly value: V };
}

export class KeyMap<V> {
  private readonly root: Path<V> = { children: new Map() };

  get(key: readonly unknown[]): V | undefined {
    return this.locate(key)?.entry?.value;
  }

  has(key: readonly unknown[]): boolean {
    return this.locate(key)?.entry !== undefined;
  }

  set(key: readonly unknown[], value: V): void {
    let path = this.root;
    for (const part of key) {
      let next = path.children.get(part);
      if (next === undefined) {
        next = { children: new Map() };
        path.children.set(part, next);
      }
      path = next;
    }
    path.entry = { value };
  }

  delete(key: readonly unknown[]): void {
    const path = this.locate(key);
    if (path) {
      path.entry = undefined;
    }
  }

  /** Every value in the map, in no particular order. */
  values(): V[] {
    const values: V[] = [];
    const visit = (path: Path<V>): void => {
      if (path.entry) {
        values.push(path.entry.value);
      }
      for (const child of path.children.values()) {
        visit(child);
      }
    };
    visit(this.root);
    return values;
  }

  private locate(key: readonly unknown[]): Path<V> | undefined {
    let path: Path<V> | undefined = this.root;
    for (const part of key) {
      path = path.children.get(part);
      if (path === undefined) {
        return undefined;
      }
    }
    return path;
  }
}
