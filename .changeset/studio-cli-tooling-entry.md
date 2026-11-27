---
'@sanity/cli': minor
'@sanity/cli-build': minor
'@sanity/cli-core': minor
'@sanity/cli-test': patch
---

Load the schema, manifest, icon and workspace helpers the CLI needs from `getStudioCliTooling()` in `sanity/cli`, instead of importing `SchemaError`, `createDefaultIcon`, `resolveConfig`, `createSchema` and `generateStudioManifest` from the root `sanity` entry. Studios that do not export `getStudioCliTooling()` yet keep working: the CLI falls back to those root exports.
