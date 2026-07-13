---
'@sanity/cli': minor
---

Make `projects create` automation-safe by erroring with flag guidance instead of prompting when no organizations are available or the choice is ambiguous, returning a usage exit code for invalid dataset names, and keeping JSON output parseable when creating a dataset.
