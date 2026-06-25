---
'@sanity/workbench-cli': patch
'@sanity/cli-core': patch
---

Thread an internal `isSingleton` flag through `unstable_defineApp` to the deploy command. Hidden from the public `DefineAppInput` type like `applicationType` — Sanity-owned apps set it, user apps never see it.
