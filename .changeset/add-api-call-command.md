---
"@sanity/cli": minor
---

Adds `sanity api <endpoint>` to call any operation listed by `sanity api list`. Body: `-f key=value` (JSON object, dotted keys nest), `-F key=@path` (file-backed field), `--input <path>` (raw body from file or `-` for stdin; recommended for deterministic body shape). Plus `-X`, `-q`, `--query` (GROQ shortcut), `-H`, `--projectId` (alias `--project`), `--organizationId` (alias `--organization`), `--dataset`, `--token`, `--json`, `--dry-run`, `--stream`, and `--yes`. Destructive methods (PATCH/PUT/DELETE) require `--yes` in unattended contexts; the interactive prompt notes that the operation "modifies server state". Body-required errors name the operation's required fields and point at `sanity api spec --operation=<id> --format=json`. No-match errors include a "Did you mean" suggestion when a close template exists (api-version typos, etc.).
