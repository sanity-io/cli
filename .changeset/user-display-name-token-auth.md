---
"@sanity/cli": patch
"@sanity/cli-core": patch
---

Stop rendering a literal `null` when authenticating with an API token. Token auth resolves to a user with no email, so `sanity init` printed `You are logged in as null using Sanity-token`, wrote `"author": "Name <null>"` into the generated `package.json`, and `sanity debug` reported `Email: null`. User-facing output now falls back to the account name, and `SanityOrgUser.email` is correctly typed as nullable.
