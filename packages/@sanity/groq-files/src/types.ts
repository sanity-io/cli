/**
 * Shared by every typed `.groq` module. Reference objects in a result carry this symbol, the
 * same way `sanity typegen` output does. Declaring it once here, instead of once per module,
 * keeps two `.groq` files with the same query text structurally identical.
 */
export const internalGroqTypeReferenceTo: unique symbol = Symbol.for(
  '@sanity/groq-files/internalGroqTypeReferenceTo',
)

/**
 * The type of a `.groq` default export: the query string literal, carrying its result and
 * params types along with it.
 *
 * The two extra properties never exist at runtime. They are optional phantom members, the same
 * device `@sanity/sdk` uses for `__schemaTypeName`, so the value is still assignable to `string`
 * and to its own literal, works in template literals and `===`, and can be passed to any
 * `fetch(query: string)`. Because the brand is structural and keyed by plain strings, a client or
 * SDK can read it back with `Q extends {readonly __groqResult?: infer R}` without importing this
 * package. Nothing is added to the global `SanityQueries` interface.
 */
export type GroqQuery<Query extends string, Result, Params> = Query & {
  readonly __groqParams?: Params
  readonly __groqResult?: Result
}

/** The result type a `.groq` default export carries, or `unknown` for a plain string. */
export type GroqResult<Query> = Query extends {readonly __groqResult?: infer Result}
  ? Result
  : unknown

/** The params type a `.groq` default export carries, or `unknown` for a plain string. */
export type GroqParams<Query> = Query extends {readonly __groqParams?: infer Params}
  ? Params
  : unknown
