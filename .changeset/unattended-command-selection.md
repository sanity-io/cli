---
'@sanity/cli': minor
---

feat(cli): avoid interactive setup choices in unattended mode

Choose login providers and package managers deterministically when possible, and return usage errors
when a choice is required.
