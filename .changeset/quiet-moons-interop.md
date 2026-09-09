---
'@sanity/cli-core': patch
---

fix(cli-core): restore CommonJS interop for studio dependency graphs, so minified UMD modules and `exports.default = obj` modules import correctly again
