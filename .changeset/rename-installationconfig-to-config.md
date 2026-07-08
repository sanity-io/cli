---
'@sanity/workbench-cli': patch
'@sanity/cli': patch
---

refactor(workbench): rename the internal `installationConfig` field, schemas, and exports to `config` (a workbench config always refers to an installation). The `installation_config` module-federation type and the `/installations` API are unchanged.
