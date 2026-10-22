# @sanity/groq-files

Experimental, opt-in typed imports for `.groq` files.

```ts
import {createClient} from '@sanity/client'
import {type GroqResult} from '@sanity/groq-files/types'

import getPostBySlug, {type Params as SlugParams} from './postBySlug.groq'
import getPosts, {type Result as Posts} from './posts.groq'

const client = createClient({
  apiVersion: '2026-01-01',
  dataset: 'production',
  projectId: 'your-project',
  useCdn: true,
})

const posts: Posts = await client.fetch<GroqResult<typeof getPosts>>(getPosts)
const params: SlugParams = {slug: 'hello'}
const post = await client.fetch<GroqResult<typeof getPostBySlug>>(getPostBySlug, params)
```

`posts.groq` holds the query, for example `*[_type == "post"]{title, role}`. Importing it gives you that string, typed so the result and params inferred from your schema travel with it. In the same spirit as a TypeScript 7.1 content mapper that imports JSON `as const`, the mapper only makes the import carry precise types; it adds no helpers. Nothing here changes the Sanity CLI or `@sanity/client`. You add the package, point it at the schema, and pick a bundler plugin.

## What a `.groq` module exports

| Export    | Kind  | What it is                                                                                                       |
| --------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| `default` | value | The query string, typed as `GroqQuery<"<query text>", Result, Params>`.                                          |
| `Result`  | type  | The result type `@sanity/codegen` infers from the schema. `[0]` is `T \| null`, everything else an array.        |
| `Params`  | type  | The params object. A field comparison takes the field's type, including string enums. Slice bounds are `number`. |

That is the whole module. At runtime it is `export default "<query text>"`.

## How the result type is carried

`@sanity/groq-files/types` exports three types:

```ts
type GroqQuery<Query extends string, Result, Params> = Query & {
  readonly __groqParams?: Params
  readonly __groqResult?: Result
}
type GroqResult<Query> = Query extends {readonly __groqResult?: infer R} ? R : unknown
type GroqParams<Query> = Query extends {readonly __groqParams?: infer P} ? P : unknown
```

The default export is the query's string literal intersected with two optional phantom properties, the same device `@sanity/sdk` uses for `__schemaTypeName`. The properties never exist at runtime, and because they are optional the value is still assignable to `string` and to its own literal, works in template literals and `===`, and goes anywhere a `fetch(query: string)` goes. The type travels with the imported value and nothing is added to the global `SanityQueries` interface, so two `.groq` files with the same text do not collide, and there is no `declare module` or `declare global` in the generated code.

The brand is structural and keyed by plain strings on purpose: a client or SDK can read it back with `Q extends {readonly __groqResult?: infer R}` without depending on this package.

### What `@sanity/client` infers today

`client.fetch(getPosts)` accepts the value, because it is a string, but returns `any`. `ClientReturn<G>` in `@sanity/client` only looks the query text up in `SanityQueries`, which this package no longer fills. Until the client reads the brand, pass the type explicitly:

```ts
const posts = await client.fetch<GroqResult<typeof getPosts>>(getPosts)
```

The client-side change that would make `client.fetch(getPosts)` infer on its own is small and lives in `@sanity/client`, not here: check the brand before the registry.

```ts
type ClientReturn<G extends string, Fallback = Any> = G extends {readonly __groqResult?: infer R}
  ? R
  : G extends keyof SanityQueries
    ? SanityQueries[G]
    : Fallback
```

and, for strict params, `G extends {readonly __groqParams?: infer P} ? P : QueryParams` on the `params` argument. `@sanity/sdk`'s `ResolveQueryResult` would need the same brand-first check, since its `SafeAccess` fallback otherwise unions every registered result type.

## Schema

Types come from the file `sanity schema extract` writes, `schema.json` by default. Keep it next to `tsconfig.json`, or pass `schemaPath`.

## TypeScript 5 and 6

TypeScript resolves `import x from './posts.groq'` to `posts.d.groq.ts` when `allowArbitraryExtensions` is on ([TypeScript 5.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#allowarbitraryextensions)). This writes that file for every `.groq` file under a directory:

```ts
import {generateGroqDeclarations} from '@sanity/groq-files/declarations'

await generateGroqDeclarations({directory: process.cwd(), schemaPath: 'schema.json'})
```

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

`bundler` resolution works too. Add `*.d.groq.ts` to `.gitignore` and run the generator before `tsc`. Updating the declarations on save, and skipping the files altogether with TypeScript 7.1's content mappers, are follow-ups on top of this package.

## Bundlers

The runtime plugin does not run the type generator. It loads the file as `export default "<query text>"`.

```ts
import groqFiles from '@sanity/groq-files/vite'

export default {plugins: [groqFiles()]}
```

One entry per bundler: `@sanity/groq-files/vite`, `/rollup`, `/webpack`, `/esbuild`, and `/rspack`, each exporting that bundler's factory as its default export. `@sanity/groq-files` exports the same five as `groqFilesPlugin`. Astro can pass the Vite plugin to `vite.plugins`. Next.js can pass the webpack plugin to `webpack`. Turbopack is not covered.

## What is inferred

- The result type comes from `@sanity/codegen`'s `TypeGenerator`, the same evaluator behind `sanity typegen generate`.
- `$param` types come from a walk of the GROQ AST against the schema. `role == $role` keeps a string enum. `$role == "admin"` widens to `string`. `tags == $tags` on an array field is `string[]`, and `$tag in tags` is `string`. `_id in $ids` is `string[]`. Slice bounds are `number`. A placeholder that is only mentioned, not compared, is `unknown`, and it is still required. `[$index]` is read as a filter, as typegen does, so it is `unknown` and the result stays an array. A query without placeholders has `Params = Record<string, never>`.
- Only the schema types a result refers to are included in the module, so a projection carries no schema at all. Reference objects import one shared `internalGroqTypeReferenceTo` from `@sanity/groq-files/types`, so two files with the same query text have identical types.

## Limits

- Opt-in and experimental. CLI commands, `defineQuery`, and the client are unchanged.
- `client.fetch(query)` returns `any` and types its params as `QueryParams` until `@sanity/client` reads the brand. Pass `GroqResult<typeof query>` as its type argument in the meantime.
- Params inside `anywhere()` selectors and comparisons against `@` or `^` are `unknown`.
- `sanity typegen generate` does not emit `.d.groq.ts` yet. Call `generateGroqDeclarations` yourself for CI.

The `example/` directory has a schema, four queries, and a `main.ts`. `src/__tests__/declarations.test.ts` generates its declarations in a temporary directory and type-checks it with `tsc`, including the assertions about what the brand does and does not do.
