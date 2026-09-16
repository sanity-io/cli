---
"@sanity/cli": patch
---

fix(cli): always use an OS-assigned free port for the local auth server to avoid conflicting with local IPv6 servers running on 4321
