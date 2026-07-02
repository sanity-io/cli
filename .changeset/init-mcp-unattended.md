---
"@sanity/cli": patch
---

fix(init): gate MCP setup on unattended mode rather than `--yes` alone, so a non-interactive `init` (including `--json`) configures MCP with defaults instead of blocking on its prompt
