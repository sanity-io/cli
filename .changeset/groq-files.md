---
'@sanity/groq-files': minor
---

Add an experimental way to import a `.groq` file as a typed query. The default export is the query string, typed as `GroqQuery<"<text>", Result, Params>` so the result type inferred from the schema and the `$param` placeholders travel with the value, with no global declarations. Includes bundler plugins for Vite, Rollup, webpack, esbuild, and rspack, and a `generateGroqDeclarations` helper that writes the `*.d.groq.ts` files TypeScript 5 and 6 resolve with `allowArbitraryExtensions`.
