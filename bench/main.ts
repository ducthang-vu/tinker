// The same list two ways, for measuring: the framework (signals, @map, track)
// and plain DOM. window.framework and window.plain expose the same three
// operations: create(n), update() (every tenth row changes), reverse().

import { signal } from "../src/signals/index.ts";
import { bootstrap, Component } from "../src/view/index.ts";

interface Row {
  readonly id: number;
  readonly label: string;
}

function rowsOf(count: number, version: number): Row[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    label: `row ${id} v${version}`,
  }));
}

@Component({
  selector: "tk-bench",
  template: "<ul>@map rows(); let row; track row.id { <li>{{ row.label }}</li> }</ul>",
})
class Bench {
  readonly rows = signal<readonly Row[]>([]);
  private version = 0;

  create(count: number): void {
    this.version = 0;
    this.rows.set(rowsOf(count, this.version));
  }

  update(): void {
    this.version++;
    this.rows.update((list) => list.map((row) => (
      row.id % 10 === 0 ? { ...row, label: `row ${row.id} v${this.version}` } : row
    )));
  }

  reverse(): void {
    this.rows.update((list) => [...list].reverse());
  }
}

const app = bootstrap(Bench, { host: document.querySelector("tk-bench")! });
const framework = app.root.instance;
Object.assign(window, {
  framework: {
    create: (count: number) => framework.create(count),
    update: () => framework.update(),
    reverse: () => framework.reverse(),
  },
});

// The plain version: the same list with nodes kept by id, and no signals.
const list = document.querySelector<HTMLUListElement>("#plain")!;
const nodes = new Map<number, HTMLLIElement>();
let plainRows: Row[] = [];
let plainVersion = 0;

function plainRender(rows: readonly Row[]): void {
  const next = rows.map((row) => {
    let node = nodes.get(row.id);
    if (!node) {
      node = document.createElement("li");
      nodes.set(row.id, node);
    }
    if (node.textContent !== row.label) {
      node.textContent = row.label;
    }
    return node;
  });
  list.replaceChildren(...next);
}

Object.assign(window, {
  plain: {
    create: (count: number) => {
      plainVersion = 0;
      plainRows = rowsOf(count, plainVersion);
      plainRender(plainRows);
    },
    update: () => {
      plainVersion++;
      plainRows = plainRows.map((row) => (
        row.id % 10 === 0 ? { ...row, label: `row ${row.id} v${plainVersion}` } : row
      ));
      plainRender(plainRows);
    },
    reverse: () => {
      plainRows = [...plainRows].reverse();
      plainRender(plainRows);
    },
  },
});
