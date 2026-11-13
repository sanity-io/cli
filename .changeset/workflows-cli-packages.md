---
'@sanity/cli': patch
---

`sanity workflows` now comes from `@sanity/workflows-cli`, which replaces `@sanity/workflow-cli`. It adds `sanity workflows whoami` and `sanity workflows codemod packages` (moves a project off the retired Workflows packages), adds `--release-resource` to `workflows start` and `--verbose` to `workflows blueprints generate`, and removes `sanity workflows set-stage`.
