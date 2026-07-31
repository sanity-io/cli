---
'@sanity/cli': patch
'@sanity/workbench-cli': patch
---

fix(deploy): build and deploy a federated studio with its installed package versions rather than silently ignoring `deployment.autoUpdates`, report the existing app id when its slug is already taken, and apply the app's `visibility`
