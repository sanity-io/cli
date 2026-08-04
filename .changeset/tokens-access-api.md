---
'@sanity/cli': major
---

feat(tokens)!: migrate token management to the Access API

The `tokens create`, `tokens list` and `tokens delete` commands are now backed by the Access API, and `--json` output returns its token shape verbatim. To migrate:

- `tokens create --json`: read the secret from `.token` instead of `.key`
- `tokens list --json`: roles now live in `.memberships[].roleNames` instead of `.roles[].name`; `createdBy`, `permissions`, `projectUserId` and `lastUsedAt` are no longer returned
- `.id` is still the identifier to pass to `tokens delete`, but existing ids change with the backing API
- `tokens list` shows role names instead of display titles, and no longer includes organization-managed tokens, which cannot be managed at project scope
