---
'@sanity/cli': patch
---

fix(deps): use typegen type fixes from @sanity/codegen 8.3.2 and groq-js 2.0.3

`select()` at the query root is typed, and `select()` with no fallback is nullable.
