---
'@sanity/workbench-cli': minor
---

Media Library config apps now get their island build wiring natively from the CLI: the module-federation remote exposes `./media-library-island-runtime` (re-exporting `sanity/media-library-island-runtime` when the app's installed `sanity` ships it), the document-wide `@layer sui.global` reset is stripped from config bundles (component styles are kept), and the generated config module carries a `subscribe()` HMR handle — the Media Library host registers a listener and receives the re-evaluated module on every field edit, falling back to a native full reload when nobody is listening. Config apps no longer need `defineMediaLibraryCli`'s Vite pipeline.
