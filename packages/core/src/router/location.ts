// The router's view of the browser location: the URL and the state of the current history
// entry, as signals. `go` and `replace` change the browser and this view together; a back or
// forward move updates the view from the browser.

import { inject, Injectable } from "../di/index.ts";
import { computed, type ReadonlySignal, signal } from "../signals/index.ts";
import { PLATFORM_LOCATION } from "./platform-location.ts";

interface Entry {
  readonly url: string;
  readonly state: unknown;
}

@Injectable()
export class Location {
  private readonly platform = inject(PLATFORM_LOCATION);
  private readonly entry = signal<Entry>(this.read());
  private readonly stopListening: () => void;

  /** The path, query and hash of the current entry. */
  readonly url: ReadonlySignal<string> = computed(() => this.entry().url);
  /** The state of the current entry, `null` when it was given none. */
  readonly state: ReadonlySignal<unknown> = computed(() => this.entry().state);

  constructor() {
    this.stopListening = this.platform.onPop(() => this.entry.set(this.read()));
  }

  /** Go to `url` as a new entry, with `state`. */
  go(url: string, state: unknown = null): void {
    this.platform.push(url, state);
    this.entry.set(this.read());
  }

  /** Replace the current entry with `url`, with `state`. */
  replace(url: string, state: unknown = null): void {
    this.platform.replace(url, state);
    this.entry.set(this.read());
  }

  /** Stop listening to the browser, when the injector is destroyed. */
  onDestroy(): void {
    this.stopListening();
  }

  private read(): Entry {
    return { url: this.platform.url(), state: this.platform.state() };
  }
}
