import {type Command, type Config, Help, type Interfaces} from '@oclif/core'

import {invokableCommands} from './InvokableCommands.js'

const invokableCommandIds = new Set(
  [...invokableCommands.keys()].map((id) => id.replaceAll(' ', ':')),
)

const invokableTopicNames = new Set(
  [...invokableCommandIds].filter((id) => id.includes(':')).map((id) => id.split(':')[0]),
)

/** Thrown when help is requested for a subject outside the invokable surface. */
class NotInvokableError extends Error {}

/**
 * oclif help renderer scoped to the invokable command surface. Subject
 * resolution (root vs topic vs command help) is oclif's own; the allowlist is
 * enforced at the rendering entry points so the rest of the CLI stays
 * invisible to embedding hosts, and listings are filtered to allowlisted
 * topics/commands only.
 *
 * Output is collected in {@link InvokableHelp.lines} instead of being written
 * to the process streams.
 */
class InvokableHelp extends Help {
  public readonly lines: string[] = []

  // The copies below are load-bearing: oclif's formatters rewrite ids/names
  // in place (`cors:list` → `cors list`). Without copies those writes corrupt
  // the shared (cached) config, breaking the allowlist checks on subsequent
  // invocations.

  protected override get sortedCommands(): Command.Loadable[] {
    return super.sortedCommands
      .filter((command) => invokableCommandIds.has(command.id))
      .map((command) => ({...command}))
  }

  protected override get sortedTopics(): Interfaces.Topic[] {
    // Topic names and descriptions come from the oclif config (oclif.config.js)
    return super.sortedTopics
      .filter((topic) => invokableTopicNames.has(topic.name))
      .map((topic) => ({...topic}))
  }

  protected override log(...args: string[]): void {
    this.lines.push(...args)
  }

  public override async showCommandHelp(command: Command.Loadable): Promise<void> {
    if (!invokableCommandIds.has(command.id)) throw new NotInvokableError(command.id)
    return super.showCommandHelp({...command})
  }

  protected override async showTopicHelp(topic: Interfaces.Topic): Promise<void> {
    if (!invokableTopicNames.has(topic.name)) throw new NotInvokableError(topic.name)
    return super.showTopicHelp({...topic})
  }
}

/**
 * Render help text for the invokable command surface: root help for a bare
 * help request, or topic/command help when `argv` names a subject (e.g.
 * `['cors', '--help']`), exactly as oclif would resolve it. ANSI styling is
 * stripped so programmatic callers get plain text.
 *
 * Returns `undefined` when the subject is unknown or not invokable — callers
 * should respond the same way as for an unknown command, so hosts cannot
 * probe the full CLI surface through help.
 *
 * @internal
 */
export async function renderInvokableHelp(
  config: Config,
  argv: string[],
): Promise<string | undefined> {
  const help = new InvokableHelp(config, {stripAnsi: true})
  try {
    await help.showHelp(argv)
  } catch (err) {
    // Subjects outside the allowlist (NotInvokableError) and subjects oclif
    // itself cannot resolve (CLIError, marked with an `oclif` property) both
    // yield no help output.
    if (err instanceof NotInvokableError || err.oclif) return undefined
    throw err
  }
  return help.lines.join('\n').trimEnd()
}

/**
 * Whether `argv` asks for help rather than a command invocation: a leading
 * `help` (oclif's help command), or a help flag before any `--` terminator
 * (same rule as oclif's own dispatch, plus `-h` as a convenience).
 *
 * @internal
 */
export function isHelpRequest(argv: string[]): boolean {
  if (argv[0] === 'help') return true
  for (const token of argv) {
    if (token === '--') return false
    if (token === '--help' || token === '-h') return true
  }
  return false
}
