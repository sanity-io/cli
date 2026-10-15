---
'@sanity/cli-build': patch
---

Sign-in parameters are now removed from the studio URL before the studio loads, so they no longer stay in the address bar when the studio fails to load. Requires a version of `sanity` that supports it.
