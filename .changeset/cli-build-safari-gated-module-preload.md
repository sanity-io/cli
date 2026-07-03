---
'@sanity/cli-build': minor
---

feat(cli-build): preconnect and modulepreload the CDN `sanity` module for auto-update studios

Re-introduces the resource hints reverted in #1400. `preconnect` only warms a socket, so it runs unconditionally and is safe in every engine. `modulepreload` follows the CDN's cross-origin redirect, which triggers a WebKit CORS bug that blanks the studio, so it is gated behind a positive allowlist: it runs only for engines confirmed to handle the redirect (desktop and Android Chromium and Gecko). Any unrecognised or WebKit engine - including all iOS browsers - falls back to the plain import-map load, costing a missed download rather than risking a blank studio.
