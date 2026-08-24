---
'@sanity/cli-core': patch
'@sanity/cli': patch
---

chore: replace 10 `lodash-es` call sites with native equivalents (`String.prototype.padEnd`/`padStart`, `Array.prototype.flatMap`/`toSorted`, `Object.groupBy`, `util.isDeepStrictEqual`). `isRecord` is now exported from `@sanity/cli-core/util`. No change to command output
