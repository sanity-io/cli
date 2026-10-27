---
'@sanity/cli': patch
'@sanity/cli-core': patch
---

Standardize project selection on `--project` (`-p`). Keep `--project-id` as a deprecated alias and reject invocations that provide both names.
