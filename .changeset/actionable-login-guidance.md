---
"@sanity/cli": patch
---

fix(cli): provide actionable login guidance

Show token, provider, and SSO login commands when authentication is required, and list accepted
provider IDs in `sanity login --help`.
