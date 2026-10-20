---
'@sanity/cli': patch
'@sanity/cli-core': patch
---

Return JSON for argument and runtime errors on commands that support `--json`. Preserve existing response shapes and `-j` aliases. Programmatic invocations through `invokeSanityCli` ignore `--json` and return the command's text output; JSON for that route will follow separately.
