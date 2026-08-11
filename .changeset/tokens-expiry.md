---
'@sanity/cli': minor
---

feat(tokens): support token expiry on create and in list output

`tokens create --expires-at <date>` sets an expiry (ISO 8601 date or timestamp); interactive runs offer the same presets as sanity.io/manage. `tokens list` shows expiry in a new Expires column.
