---
"@sanity/cli": minor
---

Adds `sanity api <endpoint>` to call any operation listed by `sanity api list`. Body: `-f key=value` (JSON object, dotted keys nest), `-F key=@path` (file-backed field), `--input <path>` (raw body from file or `-` for stdin). Plus `-X`, `-q`, `-H`, `--project`, `--dataset`, `--token`, `--json`, `--dry-run`, `--stream`, and `--yes`. Destructive methods (PATCH/PUT/DELETE) require `--yes` in unattended contexts.
