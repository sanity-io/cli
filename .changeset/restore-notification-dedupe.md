---
'@sanity/cli': patch
---

Restore the once-per-version update-notification dedupe. The notification now fires once per new latest version instead of on every CLI invocation while an update is available.
