---
'@sanity/cli': patch
---

Extract `SANITY_CACHE_DIR` constant for the shared Vite cache path and rename the internal `AppManifest` type to `CoreAppManifest` (with a zod schema) for consistency with the workbench payload.
