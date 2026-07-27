---
"@sanity/cli": patch
---

`sanity datasets copy` now mentions `--skip-history` before prompting for the source and target datasets, instead of after the copy job has already started. A copy can't be canceled once it begins, so the note previously arrived too late to act on.
