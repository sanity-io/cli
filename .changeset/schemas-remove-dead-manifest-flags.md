---
"@sanity/cli": patch
---

Deprecate the `--extract-manifest` / `--no-extract-manifest` and `--manifest-dir` flags on `sanity schemas deploy`, `list`, and `delete`.

The flags stopped doing anything when these commands moved to reading the schema from the live workspace instead of a manifest file, but they were still accepted and silently ignored — and `deploy` still advertised manifest re-use in its help text. The stale help text is now gone, and passing any of the flags prints a warning that they no longer have any effect and will be removed in a future release. Behavior is otherwise unchanged.
