---
'@sanity/cli-core': major
'@sanity/workbench-cli': minor
'@sanity/cli': patch
---

refactor(workbench): move `isWorkbenchApp` from `@sanity/cli-core` to
`@sanity/workbench-cli`, next to the brand it checks. The narrowing now derives
from the `unstable_defineApp` schema instead of a hand-mirrored shape, so a new
app field can't silently drift out of the predicate. cli-core keeps a private
brand check for config-load routing only; its public `isWorkbenchApp` export is
removed.
