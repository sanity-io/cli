---
'@sanity/cli': patch
'@sanity/cli-core': patch
---

Return JSON for argument and runtime errors on commands that support `--json`. Preserve existing response shapes and `-j` aliases, and report failed programmatic JSON invocations with a nonzero exit code.
