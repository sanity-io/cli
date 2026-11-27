---
'@sanity/cli-build': minor
'@sanity/cli': minor
---

`sanity dev` and `sanity build` now honor a stricter `react`, `react-dom` or `styled-components` range declared in the installed `sanity` package's `peerDependencies`, so a newer Studio major can raise the minimum versions of these packages without a new CLI release. The minimum supported `styled-components` version also moves from 6.0.0 to 6.1.15, which every `sanity` release since 3.99 already declares as a peer; Studios on an older `styled-components` now get the "no longer supported" error and must upgrade.
