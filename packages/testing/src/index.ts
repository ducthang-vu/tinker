// The public entry point for testing Tinker apps: a test bed for a component, its
// fixtures, and the builders for templates and mocks.

export { cleanup, ComponentBuilder, MockComponentBuilder, MockDirectiveBuilder, registerRunner, TestBed } from "./lib/testbed/testbed.ts";
export type { TestRunner } from "./lib/testbed/testbed.ts";
export type { ComponentBuilder as ComponentBuilderType, TestBed as TestBedType } from "./lib/testbed/testbed.ts";
export type {
  TestingElement,
  Fixture,
  MethodName,
  MockClass,
  Spies,
  Spy,
} from "./lib/api/api.ts";
