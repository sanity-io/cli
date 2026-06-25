---
'@sanity/workbench-cli': patch
---

Bump `@module-federation/vite` to the [module-federation/vite#854](https://github.com/module-federation/vite/pull/854) preview, which fixes `findRemoteEntryFile` so a federated build's `mf-manifest.json` advertises the container (the chunk exporting `init`) as `remoteEntry` instead of a same-named `./App` expose. Resolves the `#RUNTIME-002` host failure under Vite 8 / rolldown.
