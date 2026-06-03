---
"@sanity/cli": patch
"@sanity/cli-build": patch
---

Fixes an issue where `babel-plugin-react-compiler` typings were bundled, instead of following peer dependency lookups
