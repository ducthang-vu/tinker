// Lists with @map. Each row is a view of one item; `track` gives it an identity,
// so a row keeps its element when the list changes. $index, $first and $last
// describe the row's place. `let { title, done }` destructures each item.
// `@match todos() { @case [] … }` gives the empty case.
//
// The list is replaced, never changed in place: a toggle makes a new object for
// the one row, and the other rows keep theirs.

import { inject, Injectable } from "@tinker/core";
import { computed, signal } from "@tinker/core";
import { Component, Directive, input, viewChildren } from "@tinker/core";
import { Highlight } from "./highlight.ts";

export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
}

@Injectable()
export class TodoStore {
  private nextId = 4;
  readonly todos = signal<readonly Todo[]>([
    { id: 1, title: "Write the docs", done: true },
    { id: 2, title: "Ship the release", done: false },
    { id: 3, title: "Plan the next sprint", done: false },
  ]);

  readonly done = computed(() => this.todos()
    .filter((todo) => todo.done).length);

  toggle(id: number): void {
    this.todos.update((list) => list.map((todo) => (
      todo.id === id ? { ...todo, done: !todo.done } : todo
    )));
  }

  add(): void {
    const id = this.nextId++;
    this.todos.update((list) => [...list, { id, title: `Task ${id}`, done: false }]);
  }

  clear(): void {
    this.todos.set([]);
  }
}

/** Flips the done state of the row it is in, from its `row` input. */
@Directive({ selector: "[toggle]", host: { "(click)": "flip()" } })
export class Toggle {
  private readonly store = inject(TodoStore);
  private readonly row = input(0);

  flip(): void {
    this.store.toggle(this.row());
  }
}

@Component({
  selector: "tk-todos",
  template: `
    <h2>Todos</h2>
    @let total = store.todos().length;
    <p>{{ store.done() }} of {{ total }} done, {{ toggles().length }} toggles on screen</p>
    <ul>
      @match store.todos() {
        @case [] { <li>Nothing to do</li> }
        @default {
          @map store.todos(); let todo; track todo.id {
            <li [class.done]="todo.done">
              {{ $index + 1 }}. {{ todo.title }}
              @if ($first) { <em>first</em> }
              @if ($last) { <em>last</em> }
              <button toggle [row]="todo.id" highlight>
                @if (todo.done) { undo } @else { done }
              </button>
            </li>
          }
        }
      }
    </ul>
    <button (click)="add()">Add</button>
    <button (click)="clear()">Clear</button>

    <h3>Summary, destructured</h3>
    <ul>
      @map store.todos(); let { title, done }; track title {
        <li>
          @if (done) { ✓ } @else { · }
          {{ title }}
        </li>
      }
    </ul>
  `,
  imports: [Toggle, Highlight],
  providers: [TodoStore],
})
export class Todos {
  readonly store = inject(TodoStore);
  /** The toggle directives in the list, in order: a query that follows the rows. */
  readonly toggles = viewChildren(Toggle);

  add(): void {
    this.store.add();
  }

  clear(): void {
    this.store.clear();
  }
}
