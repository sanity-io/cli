---
'@sanity/cli': patch
'@sanity/cli-core': minor
---

`@sanity/cli-core/images` exports `readImageFile`, which reads an image to upload and checks its type and its 5 MB size. `sanity organizations create` and `update` read `--logo` with it.
