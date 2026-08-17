---
'@sanity/cli': patch
---

fix: pin `@sanity/eslint-config-studio` to `^6` in the `sanity init` studio and SDK app templates, so scaffolded projects resolve against the `eslint@^9` they also pin instead of failing with `ERESOLVE`
