---
'@sanity/cli': minor
---

feat(context): `sanity context` commands move from imports to sources, syncs and documents

`context sources` (`list`, `get`, `create`, `edit`, `delete`, `upload`, `sync`), `context sources syncs` (`list`, `get`, `confirm`, `discard`), `context documents` (`list`, `get`, `content`, `delete`) and `context sync` replace `context imports` and `context refresh`, which the Context API no longer serves. Scheduled syncs are now set per source with `context sources edit --sync-frequency`, so `context update` drops `--refresh-enabled` and `--refresh-frequency`.
