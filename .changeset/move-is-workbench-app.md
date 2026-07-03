---
'@sanity/cli-core': minor
'@sanity/workbench-cli': minor
'@sanity/cli': patch
---

refactor(workbench): move the typed `isWorkbenchApp` to `@sanity/workbench-cli`, derived from the schema so it can't drift. `@sanity/cli-core` keeps a boolean `isWorkbenchApp` for compatibility.
