// The ways the pipeline stops before the navigation is committed. A stop is the error channel of a
// step, so every step that can stop returns one of these, and the pipeline passes it on unchanged.

/** No route matches the URL. */
export class NoRoute {
  private constructor(readonly url: string) {}

  /**
   * A no-route stop for `url`.
   *
   * @param url The URL no route matches.
   * @returns A NoRoute holding `url`.
   */
  static of(url: string): NoRoute {
    return new NoRoute(url);
  }
}

/** A route or a guard sends the navigation to `target` instead. Not a failure. */
export class Redirect {
  private constructor(readonly target: string) {}

  /**
   * A redirect to `target`.
   *
   * @param target The URL the navigation goes to instead.
   * @returns A Redirect holding `target`.
   */
  static of(target: string): Redirect {
    return new Redirect(target);
  }
}

/** A guard said no. */
export class Rejected {
  private constructor(readonly url: string) {}

  /**
   * A rejection of the navigation to `url`.
   *
   * @param url The URL whose navigation was rejected.
   * @returns A Rejected holding `url`.
   */
  static of(url: string): Rejected {
    return new Rejected(url);
  }
}

/** A step failed: a guard threw, the browser refused the commit, or the redirects never ended. */
export class Failed {
  private constructor(readonly url: string, readonly cause: unknown) {}

  /**
   * A failure of the navigation to `url`.
   *
   * @param url The URL whose navigation failed.
   * @param cause What went wrong.
   * @returns A Failed holding `url` and `cause`.
   */
  static of(url: string, cause: unknown): Failed {
    return new Failed(url, cause);
  }
}

/** Why the pipeline stopped. */
export type Stop = NoRoute | Redirect | Rejected | Failed;
