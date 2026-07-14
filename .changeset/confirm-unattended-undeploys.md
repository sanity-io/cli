---
'@sanity/cli': minor
---

feat(cli): require confirmation for unattended undeploys

Require `--yes` instead of treating non-interactive or JSON output as consent, distinguish usage
errors from cancellations, and keep JSON errors machine-readable.
