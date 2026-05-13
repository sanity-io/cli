---
"@sanity/cli": minor
---

Adds `sanity api spec <slug>` for inspecting a single OpenAPI spec — default human view, `--format=json` for structured per-operation output, `--format=openapi` for raw YAML, `--operation` to narrow to one operation, `--schema` to follow `$ref` pointers (defaults to JSON; `--format=yaml` for YAML). The per-operation JSON renames `path` to `openApiPath` to disambiguate it from the callable `endpoint`. Deprecates `sanity openapi get` (passthrough output preserved during the back-compat window).
