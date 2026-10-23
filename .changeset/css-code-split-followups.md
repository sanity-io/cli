---
'@sanity/cli-build': patch
---

Keep the default `generateBundle` order for code-split builds so other plugins still see `index.html`, and stop linking `?url` CSS imports as stylesheets when `build.cssCodeSplit` is false
