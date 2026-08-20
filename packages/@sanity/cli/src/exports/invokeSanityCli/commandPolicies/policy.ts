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

type InvocationPolicy = (invocation: Invocation) => boolean

type ConditionalInvocationPolicy = CommandPolicy & {
  /**
   * Flag names this policy refuses. Declarative so the help renderer can
   * omit them (and examples using them) from the advertised command surface.
   */
  deniedFlags: readonly string[]

  kind: 'conditional'
}

export interface CommandPolicy {
  kind: 'allow' | 'conditional' | 'deny'
  validate: InvocationPolicy

  /** Restrict this entry to a command contributed by this bundled plugin. */
  pluginName?: string
}

/** Every valid invocation of the command is safe. */
export const allow: CommandPolicy = {kind: 'allow', validate: () => true}

/** No invocation of the command is safe. Behaves like an unknown command. */
export const deny: CommandPolicy = {kind: 'deny', validate: () => false}

/**
 * Restrict a policy entry to a command contributed by a specific bundled
 * plugin. This lets Sanity-owned plugins opt into programmatic invocation
 * without making commands from arbitrary installed plugins invokable.
 */
export function fromPlugin(pluginName: string, policy: CommandPolicy): CommandPolicy {
  return {...policy, pluginName}
}

/**
 * Conditional policies to deny flags. The flags are also hidden
 * from rendered help, so hosts are never told about surface they cannot use.
 */
export function conditionalDenyFlags(...names: string[]): ConditionalInvocationPolicy {
  return {
    deniedFlags: names,
    kind: 'conditional',
    validate: ({flags}) =>
      names.every((name) => flags[name] === undefined || flags[name] === false),
  }
}

/**
 * Conditional policy combining {@link conditionalDenyFlags} with an extra
 * predicate on the parsed invocation, for conditions a flag name alone
 * cannot express — e.g. flag values that would read from the host machine.
 * `deniedFlags` are hidden from rendered help; the predicate is not
 * expressible there, so flags it constrains stay advertised.
 */
export function conditionalPolicy(options: {
  deniedFlags?: string[]
  validate: InvocationPolicy
}): ConditionalInvocationPolicy {
  const denyFlags = conditionalDenyFlags(...(options.deniedFlags ?? []))
  return {
    ...denyFlags,
    validate: (invocation) => denyFlags.validate(invocation) && options.validate(invocation),
  }
}

export function isConditionalInvocationPolicy(
  policy: CommandPolicy,
): policy is ConditionalInvocationPolicy {
  return policy.kind === 'conditional'
}

/** A complete policy table, keyed by oclif command id. */
export type CommandPolicySet = Readonly<Record<string, CommandPolicy>>

/** Where an invocation originates; selects the policy to enforce. */
export type InvocationSource = 'mcp'
