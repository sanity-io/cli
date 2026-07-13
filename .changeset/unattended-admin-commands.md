---
'@sanity/cli': minor
---

Improve admin commands for unattended environments:

- Default `cors add` to disallow credentials and require `--yes` for wildcard origins.
- Require an explicit origin for `cors delete`.
- Validate `tokens add` labels before project lookup and report invalid labels or roles as usage errors.
- Require a token ID and `--yes` for `tokens delete`.
- Require an email address and `--role` for `users invite`.
