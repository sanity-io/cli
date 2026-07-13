---
'@sanity/cli': minor
---

Make document commands safer to automate by requiring file input instead of opening an editor,
skipping validation confirmations in unattended environments, validating flags and file paths before
starting work, and returning distinct usage and cancellation exit codes.
