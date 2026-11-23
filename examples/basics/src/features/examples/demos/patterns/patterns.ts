// @match with the pattern forms: a string or a set of strings, ranges and
// relations, `not`, `present`, an object with an absent key, bound names, and
// array patterns. Each button moves the value to the next one in its list.

import { signal } from "@tinker/core";
import { Left, match, None, Right, Some, type Either, isSome, type Maybe } from "@tinker/functional";
import { Component } from "@tinker/core";

type Status = "idle" | "loading" | "saving" | "failed";
type Outcome = { readonly value: number } | { readonly error: string };

const STATUSES: readonly Status[] = ["idle", "loading", "saving", "failed"];
const ITEM_SETS: readonly (readonly string[])[] = [[], ["apple"], ["apple", "pear", "plum"]];
const NAMES: readonly (string | null)[] = [null, "Ana", "Ben"];

/** The value after `current` in `values`, wrapping around. */
function next<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length]!;
}

@Component({
  selector: "tk-patterns",
  template: `
    <h2>Patterns</h2>

    <h3>Alternatives, and not</h3>
    <p><button (click)="nextStatus()">Next status</button> {{ status() }}</p>
    @match status() {
      @case "loading" | "saving" { <p>Working…</p> }
      @case not "idle" { <p>Stopped: {{ status() }}</p> }
      @default { <p>Ready</p> }
    }

    <h3>Ranges and relations</h3>
    <p><button (click)="nextScore()">Next score</button> {{ score() }}</p>
    @match score() {
      @case 0..59 { <p>Below the pass mark</p> }
      @case 60..89 { <p>Passed</p> }
      @case >= 90 { <p>Excellent</p> }
    }

    <h3>Bound names, and an absent key</h3>
    <p><button (click)="toggleOutcome()">Toggle outcome</button></p>
    @match outcome() {
      @case { value, error: absent } { <p>Got {{ value }}</p> }
      @case { error } { <p>Failed: {{ error }}</p> }
    }

    <h3>Array patterns</h3>
    <p><button (click)="nextItems()">Next list</button></p>
    @match items() {
      @case [] { <p>No items</p> }
      @case [only] { <p>Just {{ only }}</p> }
      @case [first, ...rest] { <p>{{ first }}, and {{ rest.length }} more</p> }
    }

    <h3>Maybe and Either</h3>
    <p><button (click)="toggleFound()">Toggle found</button></p>
    @match found() {
      @case some(name) { <p>Found {{ name }}</p> }
      @case none { <p>Nobody found</p> }
    }
    <p><button (click)="toggleReply()">Toggle reply</button></p>
    @match reply() {
      @case ok(n) { <p>Reply {{ n }}</p> }
      @case error(message) { <p>Failed: {{ message }}</p> }
    }

    <h3>Present</h3>
    <p><button (click)="nextName()">Next name</button></p>
    @match name() {
      @case present { <p>Hello, {{ name() }}</p> }
      @default { <p>Hello, stranger</p> }
    }
  `,
})
export class Patterns {
  readonly status = signal<Status>("idle");
  readonly score = signal(42);
  readonly outcome = signal<Outcome>({ value: 42 });
  readonly items = signal<readonly string[]>(ITEM_SETS[0]!);
  readonly name = signal<string | null>(null);
  readonly found = signal<Maybe<string>>(Some.of("Ada"));
  readonly reply = signal<Either<number, string>>(Right.of(3));

  toggleFound(): void {
    this.found.update((found) => (isSome(found) ? None.of() : Some.of("Grace")));
  }

  toggleReply(): void {
    this.reply.update((reply) => (match(reply, { Left: () => false, Right: () => true })
      ? Left.of("timeout")
      : Right.of(4)));
  }

  nextStatus(): void {
    this.status.set(next(STATUSES, this.status()));
  }

  nextScore(): void {
    this.score.update((score) => (score + 25) % 101);
  }

  toggleOutcome(): void {
    this.outcome.update((outcome) => ("value" in outcome ? { error: "timeout" } : { value: 42 }));
  }

  nextItems(): void {
    this.items.set(next(ITEM_SETS, this.items()));
  }

  nextName(): void {
    this.name.set(next(NAMES, this.name()));
  }
}
