---
'@sanity/cli': patch
'@sanity/cli-build': patch
---

Upload studio schemas with `prepareSchemaUpload` from `@sanity/schema/_internal` instead of resolving `uploadSchema` from the locally installed `sanity` package.
