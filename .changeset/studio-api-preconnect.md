---
'@sanity/cli-build': patch
'@sanity/cli': patch
---

Preconnect to the project API host from the built studio's `index.html`, so DNS, TCP and TLS are done before the studio's first `/users/me` request. The host comes from `api.projectId` (and `api.apiHost`, if set) in `sanity.cli.ts`; without a project ID no hints are added.
