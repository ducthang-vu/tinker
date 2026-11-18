/* v8 ignore file -- types only, no runtime yet; remove with the runtime */
// The public entry point for testing Tinker apps. For now it exports the API's
// types only (see api.ts): `TestBed` is declared there and is exported once it is
// implemented, so that importing this package never reaches code that does not exist.

export type {
  ComponentBuilder,
  ElementFixture,
  Fixture,
  MethodName,
  MockBuilder,
  MockClass,
  Spies,
  Spy,
  TestBed,
  TestBedRef,
} from "./api.ts";
