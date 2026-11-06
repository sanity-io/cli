---
'@sanity/cli-build': patch
'@sanity/cli': patch
---

`sanity build`, `sanity deploy` and `sanity dev` warn and carry on when they can't reach Module Server to check the runtime version.
