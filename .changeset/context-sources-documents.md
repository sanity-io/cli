---
'@sanity/cli': minor
---

feat(context): `sanity context` commands are generated from the Context API spec, and move from imports to sources, syncs and documents

Most `sanity context` commands are now generated from the Context API's OpenAPI spec: one command per operation, with path parameters as arguments and query and body fields as flags, their types, enums and help text taken from the spec. Output is JSON with `--json`, otherwise a table or key-value lines.

- `context sources` (`list`, `get`, `create`, `edit`, `delete`, `upload`, `sync`), `context sources syncs` (`list`, `get`, `confirm`, `discard`), `context documents` (`list`, `get`, `content`, `edit`, `delete`) and `context sync` replace `context imports` and `context refresh`, which the Context API no longer serves.
- New: `context instructions` (`create`, `edit`, `delete`) and `context mcp initial-context`.
- Flags follow the spec's field names. `sources create` takes `--sanity-project-id` and `--sanity-dataset-id` for a dataset source, and `--include-paths`, `--exclude-paths`, `--max-depth`, `--page-limit`, `--sitemap-only` and `--ignore-query-parameters` for a crawl. `context update` drops `--refresh-enabled` and `--refresh-frequency`: syncs are scheduled per source with `context sources edit --sync-frequency`.
- `--watch` waits for the job or sync a command starts, and every delete asks for confirmation unless `--yes` is passed.
