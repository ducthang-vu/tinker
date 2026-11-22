// The testing helpers for functors and monads: import them as `@tinker/functional/v1/testing`.

export { chainLaws, functorLaws, monadLaws } from "./monad-laws.ts";
export type {
  ChainUnderTest,
  FunctorUnderTest,
  LawCheck,
  MonadUnderTest,
} from "./monad-laws.ts";
export { EDGE_VALUES } from "./edge-values.ts";
