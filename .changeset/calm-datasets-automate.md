---
'@sanity/cli': patch
---

fix(cli): support unattended mode in dataset lifecycle commands

Use deterministic export and backup paths, and return usage errors instead of prompting for missing
input or overwrite confirmation.
