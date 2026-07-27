---
'@sanity/cli': patch
---

Bump `groq-js` to `^2.0.0` and satellite packages that already use it (`@sanity/codegen@^8.0.0`, `@sanity/migrate@^8.0.1`, `@sanity/runtime-cli@^17.3.0`). Ship `sanity typegen generate` natively because `@sanity/codegen@8` no longer provides an oclif plugin.
