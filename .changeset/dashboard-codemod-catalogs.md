---
'@sanity/cli': patch
---

`sanity codemod dashboard` now offers to upgrade sanity (and, in SDK apps, `@sanity/sdk` and `@sanity/sdk-react`) to the latest version when it's too old for the Dashboard, keeps pnpm catalogs intact, and says what to edit when it can't upgrade a catalog itself
