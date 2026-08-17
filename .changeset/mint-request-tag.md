---
'@sanity/cli': patch
---

fix(new): tag mint requests as `sanity.cli` and send the stored credential when there is one, so unclaimed projects created by internal and CI runs can be told apart from real ones in reporting. A rejected credential falls back to an anonymous mint, so `sanity new` still works without an account.
