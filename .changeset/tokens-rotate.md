---
'@sanity/cli': minor
---

feat(tokens): add tokens rotate command

`echo "$SANITY_TOKEN" | sanity tokens rotate` replaces a token's secret while preserving its roles and expiry. The token is read from standard input to keep secrets out of shell history (`-t, --token` is also accepted); the previous secret is revoked immediately.
