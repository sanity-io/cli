---
'@sanity/cli-core': patch
---

Spinners now forward the lines they persist (success, failure, warning, info) to the sinks of an active CLI execution context, instead of dropping them. Frame animation and transient progress text are still discarded.
