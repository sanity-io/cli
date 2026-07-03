---
'@sanity/workbench-cli': minor
'@sanity/cli': minor
'@sanity/cli-core': patch
---

feat(workbench): add `unstable_defineMediaLibrary`

Declare the Media Library as a workbench app — sugar over `unstable_defineApp`,
which gains `isSingleton` and an optional `installationConfig`.
