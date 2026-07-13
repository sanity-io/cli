---
'@sanity/cli': minor
---

Require `--yes` before unattended undeploys instead of treating non-interactive or JSON output as
consent, and return distinct usage and cancellation exit codes while keeping JSON errors on stdout.
