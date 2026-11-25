// The router's view of the browser location: the URL and the state of the current history
// entry, as signals. `go` and `replace` change the browser and this view together. A back or
// forward move does not change the view: it is announced to `onPop` listeners, and the router
// decides whether the entry is committed, or restored with `replace`.

import { computed, inject, Injectable, type ReadonlySignal, signal } from "@tinker/core";
import { PLATFORM_LOCATION } from "./platform-location.ts";

interface Entry {
  readonly url: string;
  readonly state: unknown;
}

@Injectable()
/** The router's view of the browser location: its URL and state, as signals. */
export class Location {
  private readonly platform = inject(PLATFORM_LOCATION);
  private readonly entry = signal<Entry>(this.read());
  private readonly stopListening: () => void;
  private readonly popListeners = new Set<(url: string, state: unknown) => void>();

  /** The path, query and hash of the current entry. */
  readonly url: ReadonlySignal<string> = computed(() => this.entry().url);
  /** The state of the current entry, `null` when it was given none. */
  readonly state: ReadonlySignal<unknown> = computed(() => this.entry().state);

  constructor() {
    this.stopListening = this.platform.onPop(() => {
      const entry = this.read();
      for (const listener of this.popListeners) {
        listener(entry.url, entry.state);
      }
    });
  }

  /**
   * The URL a browser needs for an app path: the app's folder is added when it is served under one.
   *
   * @param path The app-relative path, such as `"/todos/7"`.
   * @returns The browser's URL for the path.
   */
  buildBrowserUrl(path: string): string {
    return this.platform.href?.(path) ?? path;
  }

  /**
   * Calls `listener` with the URL and state the browser moved to, when the user goes back or
   * forward. The view does not change until the listener calls `go` or `replace`.
   *
   * @param listener Called with the URL and the state of the entry the browser moved to.
   * @returns The function that stops the listener.
   */
  onPop(listener: (url: string, state: unknown) => void): () => void {
    this.popListeners.add(listener);
    return () => {
      this.popListeners.delete(listener);
    };
  }

  /**
   * Go to `url` as a new entry, with `state`.
   * @param url
   * @param state
   * @param url The URL to go to.
   * @param state The state of the new entry.
   */
  go(url: string, state: unknown = null): void {
    this.platform.push(url, state);
    this.entry.set(this.read());
  }

  /**
   * Replace the current entry with `url`, with `state`.
   * @param url
   * @param state
     * @param url The URL to replace the current entry with.
     * @param state The state of the entry.
   */
  replace(url: string, state: unknown = null): void {
    this.platform.replace(url, state);
    /**
     * Reads the browser's current entry, as the router keeps it.
     */
    this.entry.set(this.read());
  }

  /** Stop listening to the browser, when the injector is destroyed. */
  onDestroy(): void {
    this.stopListening();
  }

  /**
   *
   * @returns The URL and state of the browser's current entry.
   */
  private read(): Entry {
    return { url: this.platform.url(), state: this.platform.state() };
  }
}
