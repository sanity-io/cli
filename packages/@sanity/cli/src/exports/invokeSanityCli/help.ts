import {type Command, type Config, Help, type Interfaces} from '@oclif/core'
import {getHelpFlagAdditions} from '@oclif/core/help'

import {type CommandPolicy, type CommandPolicySet} from './commandPolicies/policy.js'

/** Command ids a policy exposes: entries that are not denied. */
function visibleCommandIds(policySet: CommandPolicySet): Set<string> {
  return new Set(
    Object.entries(policySet)
      .filter(([, policy]) => policy.kind !== 'deny')
      .map(([id]) => id),
  )
}

/** Topic names covering the visible commands: every prefix of every id. */
function visibleTopicNames(commandIds: Set<string>): Set<string> {
  const names = new Set<string>()
  for (const id of commandIds) {
    const parts = id.split(':')
    for (let length = 1; length < parts.length; length++) {
      names.add(parts.slice(0, length).join(':'))
    }
  }
  return names
}

/** Thrown when help is requested for a subject outside the policy surface. */
class NotInvokableError extends Error {}

/**
 * A copy of `command` without the policy's denied flags, and without examples
 * that use them (under any spelling: `--web`, `--w`, `-w`), so rendered help
 * only advertises invocations the policy accepts.
 */
function withoutDeniedFlags(command: Command.Loadable, policy?: CommandPolicy): Command.Loadable {
  const denied = policy?.deniedFlags
  if (!denied?.length) return {...command}

  const flags = {...command.flags}
  const spellings: string[] = []
  for (const name of denied) {
    const definition = flags[name]
    if (!definition) continue
    spellings.push(`--${name}`)
    if (definition.char) spellings.push(`-${definition.char}`)
    for (const alias of definition.aliases ?? []) spellings.push(`--${alias}`, `-${alias}`)
    delete flags[name]
  }

  const usesDeniedFlag = (example: Command.Example) => {
    const text = typeof example === 'string' ? example : example.command
    return spellings.some((spelling) =>
      new RegExp(String.raw`(^|\s)${spelling}(=|\s|$)`).test(text ?? ''),
    )
  }

  return {
    ...command,
    examples: command.examples?.filter((example) => !usesDeniedFlag(example)),
    flags,
  }
}

/**
 * oclif help renderer scoped to a policy's command surface. Subject
 * resolution (root vs topic vs command help) is oclif's own; the policy is
 * enforced at the rendering entry points so the rest of the CLI stays
 * invisible to embedding hosts, and listings are filtered to non-denied
 * commands and their topics only.
 *
 * Output is collected in {@link InvokableHelp.lines} instead of being written
 * to the process streams.
 */
class InvokableHelp extends Help {
  public readonly lines: string[] = []

  private readonly commandIds: Set<string>
  private readonly policySet: CommandPolicySet
  private readonly topicNames: Set<string>

  constructor(config: Config, policySet: CommandPolicySet) {
    super(config, {stripAnsi: true})
    this.policySet = policySet
    this.commandIds = visibleCommandIds(policySet)
    this.topicNames = visibleTopicNames(this.commandIds)
  }

  // The copies below are load-bearing: oclif's formatters rewrite ids/names
  // in place (`cors:list` → `cors list`). Without copies those writes corrupt
  // the shared (cached) config, breaking the policy checks on subsequent
  // invocations.

  protected override get sortedCommands(): Command.Loadable[] {
    return super.sortedCommands
      .filter((command) => this.commandIds.has(command.id))
      .map((command) => ({...command}))
  }

  protected override get sortedTopics(): Interfaces.Topic[] {
    // Topic names and descriptions come from the oclif config (oclif.config.js)
    return super.sortedTopics
      .filter((topic) => this.topicNames.has(topic.name))
      .map((topic) => ({...topic}))
  }

  protected override log(...args: string[]): void {
    this.lines.push(...args)
  }

  public override async showCommandHelp(command: Command.Loadable): Promise<void> {
    if (!this.commandIds.has(command.id)) throw new NotInvokableError(command.id)
    return super.showCommandHelp(withoutDeniedFlags(command, this.policySet[command.id]))
  }

  protected override async showTopicHelp(topic: Interfaces.Topic): Promise<void> {
    if (!this.topicNames.has(topic.name)) throw new NotInvokableError(topic.name)
    return super.showTopicHelp({...topic})
  }
}

/**
 * Render help text for a policy's command surface: root help for a bare help
 * request, or topic/command help when `argv` names a subject (e.g.
 * `['cors', '--help']`), exactly as oclif would resolve it. ANSI styling is
 * stripped so programmatic callers get plain text.
 *
 * Returns `undefined` when the subject is unknown or denied — callers should
 * respond the same way as for an unknown command, so hosts cannot probe the
 * full CLI surface through help.
 *
 * @internal
 */
export async function renderInvokableHelp(
  config: Config,
  argv: string[],
  policySet: CommandPolicySet,
): Promise<string | undefined> {
  const help = new InvokableHelp(config, policySet)
  try {
    await help.showHelp(argv)
  } catch (err) {
    // Subjects outside the policy surface (NotInvokableError) and subjects
    // oclif itself cannot resolve (CLIError, marked with an `oclif` property)
    // both yield no help output.
    if (err instanceof NotInvokableError || err.oclif) return undefined
    throw err
  }
  return help.lines.join('\n').trimEnd()
}

/**
 * Whether `argv` asks for help rather than a command invocation: a leading
 * `help` (oclif's help command), or a recognized help flag before any `--`
 * terminator. The flags come from {@link getHelpFlagAdditions} — the same
 * source oclif's own dispatch consults — so this surface recognizes exactly
 * what the regular CLI recognizes.
 *
 * @internal
 */
export function isHelpRequest(argv: string[], config: Config): boolean {
  if (argv[0] === 'help') return true
  const helpFlags = getHelpFlagAdditions(config)
  for (const token of argv) {
    if (token === '--') return false
    if (helpFlags.includes(token)) return true
  }
  return false
}
