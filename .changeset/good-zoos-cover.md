---
"@sanity/cli": patch
---

fix: disallow setting cookies in programmatic `sanity api` invocations

Fixes a bug that allows users to set a `Cookie` header `sanity api` when using `run_sanity_cli` via the Sanity MCP server.
