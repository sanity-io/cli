---
'@sanity/cli-build': patch
'@sanity/workbench-cli': patch
---

feat: only emit the resource-bindings module for Blueprints builds

The `sanity-resource-bindings.js` module is now gated behind an `isBlueprints` flag (default off), which `@sanity/runtime-cli` sets when it builds a studio or app for a Blueprint. A normal `sanity build`, `dev`, or `preview` no longer emits or imports it.
