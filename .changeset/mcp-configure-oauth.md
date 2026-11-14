---
'@sanity/cli': minor
---

feat(mcp): use OAuth for every agent in `sanity mcp configure`

`sanity mcp configure` and `sanity init` no longer save a login token in your agent's MCP config. Every supported agent now signs in to the Sanity MCP server itself, using OAuth, the first time it connects. If an agent's Sanity MCP config contains a token, `sanity mcp configure` and `sanity init` offer to replace it with OAuth when run in a terminal, and leave it alone otherwise. Running `sanity logout` invalidates tokens saved by earlier CLI versions. If you added an API token to an agent's config yourself, revoke it in the project's API settings or with `sanity tokens` once you've switched.

`sanity mcp configure` no longer requires you to be logged in to the CLI. It now finds current Antigravity installs (`~/.gemini/config/mcp_config.json`) and writes the settings file shared by the Cline VS Code extension and Cline CLI (`~/.cline/data/settings/cline_mcp_settings.json`), so Cline CLI is no longer listed separately.
