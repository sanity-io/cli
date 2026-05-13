---
"@sanity/cli": minor
---

Adds `sanity api spec <slug>` for inspecting a single OpenAPI spec — default human view, `--format=json` for structured per-operation output, `--format=openapi` for raw YAML, `--operation` to narrow to one operation, `--schema` to follow `$ref` pointers. Deprecates `sanity openapi get` (passthrough output preserved during the back-compat window).
