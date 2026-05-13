---
"@sanity/cli": minor
---

Add `sanity api spec <slug>` for inspecting a single public Sanity HTTP spec. Default output is a structured per-operation view (typed params, request body, responses, auth, schema-reference footer); `--format=json` emits the same shape as JSON; `--format=openapi` passes through the raw OpenAPI YAML. `--operation=<id>` narrows to a single operation. `--schema=<name>` prints a single `components.schemas` entry (the follow-up for `$ref` pointers surfaced in operation output). `sanity openapi get` is deprecated (warning on stderr) and keeps its pre-deprecation passthrough output for the back-compat window.
