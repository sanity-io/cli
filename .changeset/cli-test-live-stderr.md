---
'@sanity/cli-test': minor
---

`captureOutput` (and `testCommand` via `capture`) accepts an `onStderr` callback invoked with each chunk while the command is still running, so tests can sequence on output from long-running commands such as watchers.
