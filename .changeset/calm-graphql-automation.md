---
'@sanity/cli': minor
---

Make GraphQL and schema commands safe to automate by requiring `--force` or `--yes` for
confirmation-gated operations, preserving machine-readable schema JSON on stdout, validating schema
inputs before starting work, and returning distinct usage and cancellation exit codes.
