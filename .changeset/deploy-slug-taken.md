---
'@sanity/cli': patch
'@sanity/workbench-cli': patch
---

fix(deploy): when a workbench app's slug is already taken, report the existing app id and how to reuse it via `deployment.appId`
