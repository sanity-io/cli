import {Command, Help, Interfaces} from '@oclif/core'

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
}

/**
 * @internal
 */
export function guessBinCommand(): string {
  const pm = guessPackageManager()
  if (pm === 'npm') return 'npx sanity'
  if (pm === 'pnpm') return 'pnpm exec sanity'
  if (pm === 'bun') return 'bunx sanity'
  if (pm === 'yarn') {
    const major = guessYarnMajorVersion()
    if (major !== undefined && major >= 2) return 'yarn run sanity'
    return 'yarn sanity'
  }
  return 'sanity'
}

/**
 * @internal
 */
export function prefixBinName(help: string): string {
  const binCommand = guessBinCommand()
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
  const pm = guessPackageManager()
  if (pm === 'yarn') return `yarn create sanity`
  if (pm === 'bun') return `bun create sanity@latest`
  if (pm === 'pnpm') return `pnpm create sanity@latest`
  return `npm create sanity@latest`
}

function needsFlagSeparator() {
  const pm = guessPackageManager()
  return pm === 'npm' || !pm
}

function guessPackageManager() {
  const ua = process.env.npm_config_user_agent || ''
  if (ua.includes('pnpm')) return 'pnpm'
  if (ua.includes('yarn')) return 'yarn'
  if (ua.includes('bun')) return 'bun'
  if (ua.includes('npm')) return 'npm'
}

function guessYarnMajorVersion(): number | undefined {
  const ua = process.env.npm_config_user_agent || ''
  const match = ua.match(/yarn\/(\d+)/)
  return match ? Number.parseInt(match[1], 10) : undefined
}
