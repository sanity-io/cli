/**
 * Per-source command policies for programmatic CLI invocation.
 *
 * A policy decides, for one invocation source (e.g. the remote MCP server),
 * which commands may be invoked and — for conditional entries — which parsed
 * invocations of those commands are acceptable. Policies are exhaustive:
 * every command in this package's oclif manifest has exactly one entry, so a
 * newly added CLI command cannot slip into (or ambiguously stay out of) the
 * invokable surface. A unit test enforces this; at runtime an uncategorized
 * command id fails closed (treated as deny).
 */

/** The parsed command invocation a conditional policy is evaluated against. */
interface Invocation {
  args: Readonly<Record<string, unknown>>
  flags: Readonly<Record<string, unknown>>
}

export type InvocationPolicy = (invocation: Invocation) => boolean

export interface CommandPolicy {
  kind: 'allow' | 'conditional' | 'deny'
  validate: InvocationPolicy
}

/** Every valid invocation of the command is safe. */
export const allow: CommandPolicy = {kind: 'allow', validate: () => true}

/** No invocation of the command is safe. Behaves like an unknown command. */
export const deny: CommandPolicy = {kind: 'deny', validate: () => false}

/** Safety depends on the parsed arguments or flags. */
export function conditional(validate: InvocationPolicy): CommandPolicy {
  return {kind: 'conditional', validate}
}

/** A complete policy table, keyed by oclif command id. */
export type CommandPolicySet = Readonly<Record<string, CommandPolicy>>

/** Where an invocation originates; selects the policy to enforce. */
export type InvocationSource = 'mcp'
