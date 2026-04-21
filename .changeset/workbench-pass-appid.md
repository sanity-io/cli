---
'@sanity/cli': minor
---

Include `deployment.appId`, `app.title`, and the resolved SVG content of `app.icon` in the local applications payload sent to the workbench dev server, so workbench can identify and present each discovered app. Local applications are now advertised under the host resolved from this process's `server.hostname` (rather than the workbench's host) when federation is enabled.
