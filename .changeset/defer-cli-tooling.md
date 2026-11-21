---
'@sanity/cli': minor
'@sanity/cli-core': major
'@sanity/cli-build': minor
'@sanity/workbench-cli': patch
---

Install Studio, Workbench, Functions, Blueprints, Workflows, and TypeGen tooling when their commands need it. Command help is available from the base CLI install.

Ship an npm shrinkwrap so fresh npm installs of the standalone CLI spend less time resolving dependencies.

Studio worker helpers now live in `@sanity/cli-build/_internal/worker`.
