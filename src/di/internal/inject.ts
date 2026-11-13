// Dependency injection internals.
//
// Design rule: Tinker bans the Service Locator pattern from its public API.
// Users never get an object they can query for dependencies at any time:
// the Injector class and its `get()` stay internal. The public API will be
// `inject()`, which only works inside an injection context (while a class
// or a provider factory is being created), so dependencies are declared up
// front. If a real need appears, an opaque handle (no methods) may be
// exposed, usable only by passing it back to framework functions.
//
// Internally there is one kind of token, `Token<T>`, and `get()` has one
// signature. The public API will accept classes too, turning them into
// tokens with an adapter at the boundary.

import { currentInjector } from "./context/current-injector.ts";
import type { Injector } from "./injector.ts";

/** Type-only key: never exists at runtime, only lets Token<T> carry its T. */
declare const TOKEN_TYPE: unique symbol;

/**
 * Identifies something that can be injected, and the type `T` of its value.
 * Tokens are matched by identity; `name` is only for messages. Create them
 * with `new InjectionToken<T>(name)`. (The public API turns classes into tokens.)
 */
export interface Token<T> {
  readonly name: string;
  /**
   * Type-only marker, never set at runtime. It makes `T` part of the type
   * (so `Token<string>` and `Token<number>` differ), and it is required, so
   * neither a plain `{ name }` object nor a class can pass for a token.
   */
  readonly [TOKEN_TYPE]: T;
  /**
   * Whether several providers contribute to this token, and inject() returns
   * all their values (see InjectionToken.multi). Absent means false.
   */
  readonly multi?: boolean;
}

/** Type-only key: lets a MultiToken carry the type of one contribution. */
declare const ELEMENT_TYPE: unique symbol;

/**
 * A token several providers contribute to: `inject()` gives a list of their
 * values, `readonly T[]`, and each provider gives one `T`. Created with
 * `InjectionToken.multi<T>(name)`; at runtime it is an InjectionToken.
 */
export type MultiToken<T> = InjectionToken<readonly T[]> & { readonly [ELEMENT_TYPE]: T };

/** Any token but a multi one: intersect with it to exclude MultiTokens. */
export interface NotMulti {
  readonly [ELEMENT_TYPE]?: never;
}

/** A token for a value of type `T`, e.g. `new InjectionToken<string>("API_URL")`. */
export class InjectionToken<T> implements Token<T> {
  /** Type-only (`declare`): no such property exists at runtime. */
  declare readonly [TOKEN_TYPE]: T;

  /**
   * @param name Used in messages, e.g. "No provider for API_URL".
   * @param multi Whether several providers contribute to it: use `InjectionToken.multi()`.
   */
  constructor(
    readonly name: string,
    readonly multi = false,
  ) {}

  /**
   * A token several providers contribute to, e.g. validators or plugins:
   *
   *   const VALIDATORS = InjectionToken.multi<Validator>("VALIDATORS");
   *   provide(VALIDATORS, { useClass: Required });     // one Validator each
   *   inject(VALIDATORS);                               // readonly Validator[]
   *
   * The list holds the values of the nearest injector that has providers
   * for it, in provider order (a child's list replaces its parent's), and
   * is empty if none has.
   */
  static multi<T>(name: string): MultiToken<T> {
    return new InjectionToken<readonly T[]>(name, true) as MultiToken<T>;
  }
}

/** Where `inject()` looks, and what it does when nothing is found. */
export interface InjectOptions {
  /** Look only in the current injector. */
  readonly self?: boolean;
  /** Start looking at the current injector's parent. */
  readonly skipSelf?: boolean;
  /** Stop looking after the first injector that is a host boundary (a component's injector). */
  readonly host?: boolean;
  /** Return `null` instead of throwing when nothing provides the token. */
  readonly optional?: boolean;
}

/** What `inject()` returns: `T`, or `T | null` when `optional` may be true. */
export type InjectResult<T, O> = O extends { readonly optional: infer Optional }
  ? true extends Optional
    ? T | null
    : T
  : T;

/**
 * The value for `token`, looked up from the current injector and then its
 * parents (narrowed by `options`). Only works inside an injection context
 * (while a value is being created, or inside `runInInjectionContext`), so
 * dependencies are declared up front instead of looked up at any time.
 */
export function inject<T, O extends InjectOptions = {}>(
  token: Token<T>,
  options?: O,
): InjectResult<T, O> {
  const start = currentInjector.get();
  if (!start) {
    throw new Error("inject() must be called in an injection context");
  }
  const { self = false, skipSelf = false, host = false, optional = false } = options ?? {};
  if (self && skipSelf) {
    throw new Error("inject(): `self` and `skipSelf` cannot be used together");
  }
  for (let injector = skipSelf ? start.parent : start; injector; injector = injector.parent) {
    if (injector.has(token)) {
      return injector.get(token) as InjectResult<T, O>;
    }
    if (self || (host && injector.hostBoundary)) {
      break;
    }
  }
  if (token.multi) {
    return [] as InjectResult<T, O>; // nothing contributes: an empty list
  }
  if (optional) {
    return null as InjectResult<T, O>;
  }
  throw new Error(`No provider for ${token.name}`);
}
