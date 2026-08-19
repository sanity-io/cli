---
'@sanity/workbench-cli': patch
---

Allow a config-only dev server (configs, no interfaces — e.g. a media-library config app) to register alongside the app dev server that shares its slug. The dev registry now rejects only same-role duplicates, so `unstable_defineMediaLibrary` works locally while the Media Library itself is also served from a local dev server.
