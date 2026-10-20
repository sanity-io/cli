---
'@sanity/cli': patch
'@sanity/cli-core': minor
---

Return JSON for argument and runtime errors on commands that support `--json`. Preserve existing response shapes and `-j` aliases.

Commands now use oclif's built-in `--json` flag, so its help text reads `Format output as json` and appears under the GLOBAL group.

`Output` gains two required members, `logJson` and `logDiagnostic`; implementations outside this package need to provide them. `logDiagnostic` writes to stderr and stays visible in JSON mode, so a command that skipped part of its work still reports it rather than returning a partial result as a complete one.

Programmatic invocations through `invokeSanityCli` ignore `--json` and return the command's text output; JSON for that route will follow separately.
