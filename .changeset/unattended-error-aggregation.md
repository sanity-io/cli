---
'@sanity/cli': patch
---

fix(init): report all missing unattended options

Validate output path, project selection, and organization prerequisites together so unattended
`sanity init` runs report every applicable usage error in one pass.
