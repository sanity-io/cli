import {Command, Help, Interfaces} from '@oclif/core'
import {getBinCommand, getRunningPackageManager} from '@sanity/cli-core/package-manager'

import {topicAliases} from './topicAliases.js'

// Reverse map: alias name → canonical topic name
const aliasToCanonical = new Map<string, string>()
for (const [canonical, aliases] of Object.entries(topicAliases)) {
  for (const alias of aliases) {
    aliasToCanonical.set(alias, canonical)
  }
}

// Running `oclif readme`, we don't want to apply the `prefixBinName` transformation,
// as it will include whatever pm was used to spawn the script in the generated readme.
// argv will contain something like [nodeBinPath, oclifBinPath, 'readme', …] so check
// for 'readme' with a preceeding argument that includes 'oclif' to be sure.
const IS_README_GENERATION = (process.argv[process.argv.indexOf('readme') - 1] ?? '').includes(
  'oclif',
)

/**
 * Custom Help class for Sanity CLI that overrides the default help formatting to
 * prefix the bin name (e.g., `npx sanity`, `yarn sanity`, etc.) in the help text,
 * and to replace `sanity init` references with the appropriate `create` command
 * for the detected package manager when needed.
 *
 * @internal
 */
export default class SanityHelp extends Help {
  protected formatCommand(command: Command.Loadable): string {
    let help = super.formatCommand(command)

    // When `sanity init` is called, but originates from the `create-sanity`
    // package/binary (eg the one used by `npm create sanity@latest` etc), we want to
    // customize the help text to show that command instead of `sanity init`.
    const isFromCreate = process.argv.includes('--from-create') && command.id === 'init'
    if (isFromCreate) {
      help = replaceInitWithCreateCommand(help)
    }

    return prefixBinName(help)
  }

  protected formatRoot(): string {
    return prefixBinName(super.formatRoot())
  }

  protected formatTopic(topic: Interfaces.Topic): string {
    return prefixBinName(super.formatTopic(topic))
  }

  async showHelp(argv: string[]): Promise<void> {
    return super.showHelp(resolveTopicAliasInArgv(argv))
  }
}

/**
 * @internal
 */
export function prefixBinName(help: string): string {
  if (IS_README_GENERATION) return help
  const binCommand = getBinCommand()
  if (binCommand === 'sanity') return help
  return help.replaceAll('$ sanity', `$ ${binCommand}`)
}

/**
 * Replace `sanity init` references in help text with the equivalent `create` command
 * for the detected package manager. Lines ending in just `sanity init\n` (no flags)
 * are replaced without a flag separator, while lines with flags get the separator
 * (eg `--` for npm) so the flags are forwarded correctly.
 *
 * @internal
 */
export function replaceInitWithCreateCommand(help: string): string {
  const createCmd = guessCreateCommand()
  const flagSeparator = needsFlagSeparator() ? ' --' : ''

  // First replace all `sanity init` references that ends with a newline with the
  // create variant that does not include any flag separator (eg `--`). Then replace
  // the other references that do. Most package managers do not require the `--`
  // separator, but npm does. Only include it if we need to, as the commands look
  // cleaner without it.
  return help
    .replaceAll(/(\s+)sanity\s+init\s*\n/g, `$1${createCmd}\n`)
    .replaceAll(/(\s+)sanity(\s+)init/g, `$1${createCmd}${flagSeparator}`)
}

function guessCreateCommand() {
  const pm = getRunningPackageManager()
  if (pm === 'yarn') return `yarn create sanity`
  if (pm === 'bun') return `bun create sanity@latest`
  if (pm === 'pnpm') return `pnpm create sanity@latest`
  return `npm create sanity@latest`
}

function needsFlagSeparator() {
  const pm = getRunningPackageManager()
  return pm === 'npm' || !pm
}

/**
 * Replace the first positional argument in argv with the canonical topic name
 * if it is a known topic alias. This ensures that `sanity dataset --help`
 * resolves to the same help output as `sanity datasets --help`.
 *
 * Without this, `--help` bypasses the command_not_found hook (which normally
 * handles alias resolution) and the help system fails to find the topic.
 *
 * @internal
 */
export function resolveTopicAliasInArgv(argv: string[]): string[] {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') break
    if (arg.startsWith('-')) continue

    // First positional argument is the topic/command name
    const canonical = aliasToCanonical.get(arg)
    if (canonical) {
      const resolved = [...argv]
      resolved[i] = canonical
      return resolved
    }
    break
  }
  return argv
}
