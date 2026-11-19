// The public entry point for resources: a value loaded by a loader, with its state, its last
// error and when it last changed. Reading it never throws.

export { resource } from "./resource.ts";
export type { Loader, Resource, ResourceOptions, ResourceState } from "./resource.ts";
export { mutation } from "./mutation.ts";
export type { Mutation, MutationOptions, MutationOutcome } from "./mutation.ts";
