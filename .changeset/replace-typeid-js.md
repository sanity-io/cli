---
'@sanity/cli': patch
---

Remove dependency on typeid-js by using Node.js crypto.randomUUID() for telemetry trace IDs.
