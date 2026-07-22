---
"@sanity/workbench-cli": patch
"@sanity/cli": patch
---

Derive workbench app and config ids with the Web Crypto API so `node:crypto` no longer crashes the dev server's browser bundle.
