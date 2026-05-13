---
"@sanity/cli": minor
---

Adds `sanity api <endpoint>` for executing requests against the Sanity HTTP API — pass the endpoint string from `sanity api list` verbatim. Supports `-X` for method override, `-q` for query params, `--project`/`--dataset` for placeholder substitution, `--token` for auth override, `--json` for raw passthrough output, and `--yes` for destructive ops. PATCH/PUT/DELETE prompt interactively and refuse in unattended mode without `--yes`. POST/PUT/PATCH without body flags error before sending (body construction lands in Phase 4).
