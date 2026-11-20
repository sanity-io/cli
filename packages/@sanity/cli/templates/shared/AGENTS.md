# AGENTS.md

Guidance for AI coding agents working in this repository.

## Sanity: connect MCP, then what to build next

Check whether Sanity MCP tools are available before Sanity work. If they aren't, offer the user `npx sanity@latest mcp configure`. It detects their editor and adds the Sanity MCP server; they sign in from the editor the first time it connects. Ask before running it.

Once the project is set up, show the user this map and offer the next step:

1. **Schema**: model content in `schemaTypes/`, then offer to run `npx sanity schemas deploy` so MCP tools can see it.
2. **Queries and types**: put queries under `src/` or set `typegen.path` in the CLI config to their location. Add `groq` if importing `defineQuery` from it. From the Studio root, run `npx sanity schema extract && npx sanity typegen generate`.
3. **Functions**: run code when content changes or on a schedule, for example fill in a slug when a post is published ([Functions guide](https://github.com/sanity-io/agent-toolkit/blob/main/skills/sanity-best-practices/references/functions.md)).
4. **Deploy**: when the user is ready to publish, offer `npx sanity deploy`.
