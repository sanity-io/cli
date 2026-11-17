---
'@sanity/cli': patch
---

feat(workflows): add `sanity workflows whoami` and `sanity workflows codemod packages`

`sanity workflows whoami` shows the user ID Workflows records for your login, for use in user assignee fields. `sanity workflows codemod packages` moves a project's imports and dependencies from the retired Workflows packages to `@sanity/workflows`, `@sanity/workflows-ui`, `@sanity/workflows-cli` and `@sanity/workflows-test`.
