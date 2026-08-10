---
'@sanity/cli': patch
---

fix(cli): keep table output within the terminal width

CLI tables now wrap long values instead of truncating content and preserve borders when Unicode width estimates differ.
