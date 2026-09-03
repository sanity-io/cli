---
'@sanity/cli': minor
---

feat(typegen): register query result types on a global SanityQueries interface

`sanity typegen generate` now writes the query type map to a global `SanityQueries` interface, plus a compatibility bridge for older `@sanity/client` releases. Typed `client.fetch` and `sanityFetch` results no longer depend on resolving the same `@sanity/client` copy as the rest of the program.

That means generated types work in strict pnpm and monorepo layouts where `@sanity/client` is not a direct dependency of the generated file, when multiple copies of the client are installed (for example one nested under `next-sanity`), and from every client entry point including `@sanity/client/stega` on `@sanity/client` 8.5.0 and the 7.x backport.

The generated file no longer starts the type map with a side-effect `import "@sanity/client"`. Existing generated files that used `declare module '@sanity/client'` keep working unchanged.
