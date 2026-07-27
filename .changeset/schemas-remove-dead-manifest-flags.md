---
"@sanity/cli": patch
---

Remove the `--extract-manifest` / `--no-extract-manifest` and `--manifest-dir` flags from `sanity schemas deploy`, `list`, and `delete`.

The flags stopped doing anything when these commands moved to reading the schema from the live workspace instead of a manifest file, but they were still accepted and silently ignored — and `deploy` still advertised manifest re-use in its help text. Passing them now reports an unknown-flag error. Behavior is otherwise unchanged.
