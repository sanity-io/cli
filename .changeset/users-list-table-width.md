---
'@sanity/cli': patch
---

fix(cli): keep table output within the terminal width

CLI tables now wrap long values instead of overflowing the terminal or truncating content.
