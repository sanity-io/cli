---
'@sanity/cli': minor
---

feat(media): add `sanity media pull-aspects` — generates `src/fields/<name>.ts` field modules from a media library's stored aspect documents, so a Media Library config app can bootstrap its config from existing aspects instead of starting from a blank page. Prints the paste-ready `fields: [...]` entries for `sanity.cli.ts`, skips invalid or already-declared aspects with reasons, and warns on documents the config model cannot fully represent (`assetType` scoping, `_id`/name mismatches)
