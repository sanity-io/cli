---
'@sanity/cli': minor
---

feat(deploy): report whether a deploy created a new application or updated an existing one (in the success output and via `target.action` in the dry-run/`--json` payload), and warn that redeploying without `deployment.appId` creates another application
