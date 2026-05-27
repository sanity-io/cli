---
"@sanity/cli-build": minor
---

Export `SchemaExtractionError` and related schema-extraction utilities from `_internal`. Without this, `@sanity/cli` fails at runtime on `sanity dev` because the published `cli-build` does not yet have the symbols that #1120 moved into it.
