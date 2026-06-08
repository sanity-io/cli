---
'@sanity/cli-core': patch
---

Drop `@sanity/federation` from `@sanity/cli-core`'s runtime dependencies by inlining the one-line workbench brand check. cli-core loads on every CLI command, so commands that never touch workbench (e.g. `sanity documents query`) no longer pay that package's import cost.
