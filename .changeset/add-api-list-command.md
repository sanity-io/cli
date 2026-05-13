---
"@sanity/cli": minor
---

Add `sanity api list` for discovering Sanity's public HTTP API endpoints. Renders a flat operation table by default; `--json` emits one row per operation; `--spec=<slug>` narrows to a single spec. `--method`, `--capability`, and `--grep` filter the result set. The human table includes an `OPERATION` column for cross-referencing into `sanity api spec --operation=<id>`. The JSON row carries `optionalQueryParams` alongside `requiredQueryParams`. `sanity openapi list` is deprecated (warning on stderr) but keeps its pre-deprecation output shape for the back-compat window.
