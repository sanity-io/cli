---
'@sanity/cli': minor
---

Prevent dataset alias and embeddings commands from opening prompts in unattended environments. Missing alias or dataset arguments and required confirmations now report actionable usage errors, while alias creation without a target dataset creates an unlinked alias.

Invalid alias names, dataset names, embeddings projections, and dataset visibility inputs now use the CLI's usage-error exit code.
