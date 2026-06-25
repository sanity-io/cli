---
'@sanity/workbench-cli': patch
'@sanity/cli': patch
---

The workbench remote dev server now claims the workbench lock and bridges the registry so app `sanity dev`s register into it instead of starting their own, and announces a clickable URL.
