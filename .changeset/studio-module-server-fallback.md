---
'@sanity/cli-build': minor
'@sanity/cli': minor
---

Auto-updating studios now load the `sanity` and `@sanity/vision` versions they were built with, straight from the module bucket, when Module Server errors or takes longer than 4 seconds to answer. If the Studio code then fails to load from Module Server, the page reloads once into those built versions.
