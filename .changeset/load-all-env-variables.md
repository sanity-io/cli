---
'@sanity/cli': patch
---

Fixed environment variable loading to include all variables from `.env` files, not just `SANITY_STUDIO_`/`SANITY_APP_` prefixed ones. This restores the ability to use non-prefixed environment variables in `sanity.cli.ts` (e.g., `process.env.NEXT_PUBLIC_SANITY_PROJECT_ID`). Client bundle exposure remains restricted to `SANITY_STUDIO_`/`SANITY_APP_` prefixed variables.
