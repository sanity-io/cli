---
'@sanity/cli': minor
---

`sanity deploy` of a Media Library config app now syncs the config's fields into the library's stored `sanity.asset.aspect` documents in the same run (DAM-1821). The deploy is a mirror: every config field is upserted and stored definitions without a matching config field are deleted — definitions only, `aspects.<name>` values on assets are never touched and resurface if a matching field is added back. Planned deletions are reported prominently (and included in `--dry-run` / `--json` output) before anything mutates; an interactive deploy asks for confirmation before deleting stored definitions (default: no), while unattended and CI deploys — which force `--yes` — delete without asking. Organizations with several active media libraries pass the new `--media-library-id` flag to pick the sync target.
