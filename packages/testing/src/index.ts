// The public entry point for testing Tinker apps: a test bed for a component, its
// fixtures, and the builders for templates and mocks.

export { ComponentBuilder, TestBed } from "./testbed.ts";
export type { ComponentBuilder as ComponentBuilderType, TestBed as TestBedType } from "./testbed.ts";
export type {
  TestingElement,
  Fixture,
  MethodName,
  MockBuilder,
  MockClass,
  Spies,
  Spy,
} from "./api.ts";
