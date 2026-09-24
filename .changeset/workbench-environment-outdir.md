---
'@sanity/workbench-cli': patch
---

fix(workbench-cli): build workbench apps into the requested output directory instead of always `dist`, so `sanity blueprints deploy` and `sanity build <outputDir>` ship the app's JavaScript, `index.html` and `mf-manifest.json`
