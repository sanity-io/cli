---
'@sanity/cli': patch
---

Fixed environment variable loading to include all variables from `.env` files, not just `SANITY_STUDIO_`/`SANITY_APP_` prefixed ones. Client bundle exposure remains restricted to prefixed variables only.
