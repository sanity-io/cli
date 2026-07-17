---
"@sanity/workbench-cli": patch
"@sanity/cli-build": patch
---

Pre-bundle a workbench app's interface deps at dev startup by scanning the entry, views, services, and config sources, so Vite no longer re-optimizes and full-page reloads mid-session — removing the need for per-app `optimizeDeps.include` lists.
