---
'@sanity/workbench-cli': minor
'@sanity/cli': minor
'@sanity/cli-core': patch
---

feat(workbench): add `unstable_defineMediaLibrary`

Declare the Media Library as a workbench app. Sugar over `unstable_defineApp`,
which gains `isSingleton` and an optional `installationConfig`. An installation
config can be anything; the media-library shape carries a `fields` array (each
field's `src` is a `defineField` schema type). The fields compile into one
config module in the federation remote (with HMR), exposed as
`./configs/installation_config` — the workbench loads the full config (schema
types) from that module — and deploy ships it on its own path, a versioned
snapshot on the app's org installation, separate from the view/service
interface path.
