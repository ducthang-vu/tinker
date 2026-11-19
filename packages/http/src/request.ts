// What an HTTP request is, and what a response is. Both are plain data: a backend turns
// a request into a response, and nothing else in this package looks inside them.

/** The options of a request: the verb and URL are given separately. */
export interface RequestOptions {
  /** The headers to send. A JSON body sets `content-type` unless one is given here. */
  readonly headers?: Readonly<Record<string, string>>;
  /** The body. Strings and Blobs are sent as they are; anything else as JSON. */
  readonly body?: unknown;
}

/** A request, as a backend receives it. */
export interface HttpRequest extends RequestOptions {
  /** The verb. Any token is sent as given: HTTP methods are case-sensitive and open. */
  readonly method: string;
  readonly url: string;
}

/** A response: its status, its headers, and its body, parsed when it is JSON. */
export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: T;
}
