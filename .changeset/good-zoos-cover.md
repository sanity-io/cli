---
"@sanity/cli": patch
---

fix(cli): disallow setting cookies in programmatic `sanity api` invocations

Fixes a bug that allows users to provide a `Cookie` header to `sanity api` when using `run_sanity_cli` via the Sanity MCP server.
