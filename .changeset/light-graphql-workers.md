---
'@sanity/cli': patch
'@sanity/cli-core': patch
'@sanity/cli-build': patch
---

Add an opt-in to reduce memory usage when preparing GraphQL deployments. Set `SANITY_CLI_GRAPHQL_NATIVE_DEPENDENCIES=1` to enable it. Studios with custom Vite configuration or TypeScript path overrides keep the existing behavior.
