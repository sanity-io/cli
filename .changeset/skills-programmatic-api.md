---
'@sanity/cli': patch
---

Fix `sanity init` and `sanity skills install` failing with `ERR_PACKAGE_PATH_NOT_EXPORTED` when setting up agent skills. Agent skills are now installed through the `skills` package's programmatic API instead of its CLI binary.
