// The public entry point for testing Tinker apps. For now it exports the API's
// types only (see api.ts): `TestBed.builder` is declared there and is exported once
// it is implemented, so that importing this package never reaches code that does not exist.

export type { Fixture, TestBed, TestBedBuilder } from "./api.ts";
