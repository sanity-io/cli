---
'@sanity/cli-build': minor
'@sanity/workbench-cli': minor
---

feat: bake resource bindings into a statically-imported module instead of an index.html script tag

Resource bindings now ride in a dedicated `sanity-resource-bindings.js` module emitted at the bundle root and imported before app code, so both standalone studios and federated apps resolve them the same way. The index.html script-tag placeholder has been removed.
