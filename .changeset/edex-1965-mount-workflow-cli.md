---
'@sanity/cli': minor
---

feat(workflows): mount Editorial Workflows CLI as `sanity workflows` (early access)

Adds `@sanity/workflow-cli` so Editorial Workflows commands are available as `sanity workflows …` (singular `sanity workflow …` also works). Early access. Requires a `sanity.workflow.ts` in the working directory; authenticate with `sanity login` or `SANITY_AUTH_TOKEN`. The standalone `sanity-workflows` / `npx @sanity/workflow-cli` binary remains supported.
