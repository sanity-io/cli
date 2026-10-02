---
'@sanity/cli-build': patch
---

Apps no longer show an "Uncaught error: Cannot read properties of null" overlay when the browser reports an error without an error object, such as a ResizeObserver loop.
