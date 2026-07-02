---
'@sanity/workbench-cli': patch
'@sanity/cli-build': patch
'@sanity/cli': patch
---

refactor(workbench): thread views/services as one `exposes` bundle through the
build/dev plumbing, so adding a declaration family no longer touches every hop
