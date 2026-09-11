---
'@sanity/cli-core': patch
---

fix(cli-core): restore CommonJS interop for studio dependency graphs, so minified UMD modules, `exports.default = obj` modules, and modules ending in the `module.exports.default = module.exports` interop footer (which every `@babel/runtime` helper uses) import correctly again
