/**
 * The contract for exposing CLI commands to programmatic invocation sources,
 * such as the remote MCP server.
 *
 * A command reaches a programmatic caller only when it satisfies both halves
 * of this contract:
 *
 * 1. **Capability.** The command must be runnable in isolation, which means
 *    extending `SanityCommand` (see `@sanity/cli-core/SanityCommand`). That
 *    base class supplies `runInExecutionContext()` and routes output, token
 *    resolution, interactivity, and project discovery through the CLI
 *    execution context. A command extending oclif's `Command` directly cannot
 *    be invoked programmatically, no matter what policy it declares.
 * 2. **Policy.** Something must state that the invocation is safe. For the
 *    `@sanity/cli` package's own commands that statement lives in the CLI. A
 *    plugin states it for its own commands by declaring a policy module (see
 *    {@link PluginInvocationPolicies}).
 *
 * Anything not covered by both halves is denied. The absence of a policy is
 * never read as permission.
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
}

/** Every valid invocation of the command is safe. */
export const allow: CommandPolicy = {kind: 'allow', validate: () => true}

/** No invocation of the command is safe. Behaves like an unknown command. */
export const deny: CommandPolicy = {kind: 'deny', validate: () => false}

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

/**
 * Identified by `kind` rather than by identity, because a plugin's policies
 * are built against its own copy of this module.
 */
export function isConditionalInvocationPolicy(
  policy: CommandPolicy,
): policy is ConditionalInvocationPolicy {
  return policy.kind === 'conditional'
}

/** A complete policy table, keyed by oclif command id. */
export type CommandPolicySet = Readonly<Record<string, CommandPolicy>>

/** Where an invocation originates; selects the policy to enforce. */
export type InvocationSource = 'mcp'

/**
 * The policies a plugin declares for the commands it contributes, keyed by
 * invocation source. A source left out denies every command for that source.
 *
 * Declared by pointing at the module from the plugin's package.json:
 *
 * ```json
 * {"sanity": {"invocationPolicies": "./dist/invocationPolicies.js"}}
 * ```
 *
 * The module must provide this table as a named `invocationPolicies` export.
 * It is resolved once per plugin, so root help stays cheap, and it is code
 * rather than JSON so conditional policies can inspect parsed invocations.
 *
 * Two limits apply, and neither is negotiable by the declaring plugin:
 * entries for commands the plugin does not contribute are ignored, and the
 * hosting CLI may still refuse anything declared here. A declaration is a
 * request to expose surface, not a grant.
 */
export type PluginInvocationPolicies = Partial<Record<InvocationSource, CommandPolicySet>>

/**
 * Type-checked identity helper for authoring a plugin's policy module.
 *
 * ```ts
 * import {allow, definePluginInvocationPolicies, deny} from '@sanity/cli-core/commandPolicy'
 *
 * export const invocationPolicies = definePluginInvocationPolicies({
 *   mcp: {
 *     'widgets:list': allow,
 *     // Reads widget definitions from the local filesystem.
 *     'widgets:push': deny,
 *   },
 * })
 * ```
 */
export function definePluginInvocationPolicies(
  policies: PluginInvocationPolicies,
): PluginInvocationPolicies {
  return policies
}

/**
 * Whether an arbitrary value is a usable policy table. Plugin policy modules
 * are third-party code loaded at runtime, so their shape is verified rather
 * than trusted; anything that does not match is treated as no declaration at
 * all, which denies the plugin's commands.
 */
export function isCommandPolicySet(value: unknown): value is CommandPolicySet {
  if (typeof value !== 'object' || value === null) return false

  return Object.values(value).every((policy: unknown) => {
    if (typeof policy !== 'object' || policy === null) return false
    const {kind, validate} = policy as Partial<CommandPolicy>
    return (
      (kind === 'allow' || kind === 'conditional' || kind === 'deny') &&
      typeof validate === 'function'
    )
  })
}
