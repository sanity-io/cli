---
'@sanity/cli-build': patch
---

fix(build): a config-only build (the Media Library config app) no longer requires `@sanity/sdk-react` — it verifies `sanity` (the island-runtime provider) instead and skips the SDK auto-update machinery, so the scaffolded `media-library-config` template deploys without installing the SDK
