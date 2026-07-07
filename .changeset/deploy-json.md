---
'@sanity/cli': minor
---

feat(deploy): add a `--json` flag

`sanity deploy --json` emits the deploy result — or, with `--dry-run`, the deploy plan — as machine-readable JSON: the resolved target (id, title, and dashboard/studio URL), framework version, files, and any blocking problems. It's built from the same source as the human report so the two can't drift, and core apps now print their dashboard URL in the plan and success output like studios already did.
