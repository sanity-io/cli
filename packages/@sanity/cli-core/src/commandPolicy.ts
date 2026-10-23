import {z} from 'zod/mini'

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

/** The command invocation a conditional policy is evaluated against. */
const InvocationPolicySchema = z.function({
  input: [
    z.object({
      args: z.record(z.string(), z.unknown()),
      flags: z.record(z.string(), z.unknown()),
    }),
  ],
  output: z.boolean(),
})

// A conditional entry must carry the deniedFlags list for the help renderer
// to omit them from the advertised command surface.
const CommandPolicyConditionalSchema = z.object({
  deniedFlags: z.array(z.string()),
  kind: z.literal('conditional'),
  validate: InvocationPolicySchema,
})

const CommandPolicySchema = z.union([
  z.object({
    kind: z.enum(['allow', 'deny']),
    validate: InvocationPolicySchema,
  }),
  CommandPolicyConditionalSchema,
])

const CommandPolicySetSchema = z.record(z.string(), CommandPolicySchema)

type InvocationPolicy = z.infer<typeof InvocationPolicySchema>

type ConditionalInvocationPolicy = z.infer<typeof CommandPolicyConditionalSchema>

export type CommandPolicy = z.infer<typeof CommandPolicySchema>

/** A complete policy table, keyed by oclif command id. */
export type CommandPolicySet = z.infer<typeof CommandPolicySetSchema>

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
 * entries for commands the plugin does not contribute are ignored, and a
 * command the hosting CLI already governs keeps the CLI's own policy. A
 * declaration is a request to expose surface, not a grant.
 */
export type PluginInvocationPolicies = Partial<Record<InvocationSource, CommandPolicySet>>

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
 * Identified by shape rather than by identity, because a plugin's policies are
 * built against its own copy of this module.
 *
 * `deniedFlags` is checked as well as `kind`, so callers that read it off the
 * narrowed type cannot be handed an object that only claims to be conditional.
 */
export function isConditionalInvocationPolicy(
  policy: CommandPolicy,
): policy is ConditionalInvocationPolicy {
  return CommandPolicyConditionalSchema.safeParse(policy).success
}

/**
 * Whether an arbitrary value is a usable policy table. Plugin policy modules
 * are third-party code loaded at runtime, so their shape is verified rather
 * than trusted; anything that does not match is treated as no declaration at
 * all, which denies the plugin's commands.
 */
export function isCommandPolicySet(value: unknown): value is CommandPolicySet {
  return CommandPolicySetSchema.safeParse(value).success
}
