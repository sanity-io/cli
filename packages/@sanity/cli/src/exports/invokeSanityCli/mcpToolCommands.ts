/**
 * Commands exposed as dedicated MCP tools via {@link getMcpToolDefinitions}.
 *
 * Distinct from the MCP policy: the policy says what MAY be invoked, this
 * list says what gets a dedicated tool — a curation decision per command.
 * Every entry must be policy-allowed and generate cleanly (enforced by the
 * getMcpToolDefinitions tests). Freeform hosts that also expose the dedicated
 * tools exclude these via `excludeMcpToolCommands` on `invokeSanityCli`.
 *
 * Deliberately absent: `context:imports:download`, which is policy-denied for
 * MCP altogether (see mcpPolicy).
 *
 * @internal
 */
export const mcpToolCommands: readonly string[] = Object.freeze([
  'context:build',
  'context:create',
  'context:delete',
  'context:get',
  'context:imports:create',
  'context:imports:delete',
  'context:imports:get',
  'context:imports:list',
  'context:jobs:get',
  'context:list',
  'context:refresh',
  'context:update',
])
