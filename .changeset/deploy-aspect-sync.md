---
'@sanity/cli': minor
---

`sanity deploy` of a Media Library config app now mirrors the config's fields into the library's stored `sanity.asset.aspect` documents: every config field is upserted, and stored definitions without a matching field are deleted. Definitions only — `aspects.<name>` values on assets are never touched. Planned deletions are reported (also under `--dry-run` / `--json`) before anything mutates, and an interactive deploy asks before deleting; unattended and CI deploys do not. With several active media libraries, `--media-library-id` picks the sync target.
