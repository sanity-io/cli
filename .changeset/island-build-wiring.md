---
'@sanity/workbench-cli': minor
---

Media Library config apps now get their island build wiring natively from the CLI: the module-federation remote exposes `./island-runtime` (re-exporting `sanity/media-library-island-runtime` when the app's installed `sanity` ships it), the `ui5/styles.css` global stylesheet is stubbed out of config bundles, and field-module HMR updates are forwarded to the Media Library host instead of self-accepted. Config apps no longer need `defineMediaLibraryCli`'s Vite pipeline.
