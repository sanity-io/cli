import {Command, Help} from '@oclif/core'

export default class SanityHelp extends Help {
  protected formatCommand(command: Command.Loadable): string {
    const help = super.formatCommand(command)

    // When `sanity init` is called, but originates from the `create-sanity`
    // package/binary (eg the one used by `npm create sanity@latest` etc), we want to
    // customize the help text to show that command instead of `sanity init`. In the
    // future we may also want to consider prefixing with `npx` etc for non-init
    // commands - but leaving that for another day.
    const isFromCreate = process.argv.includes('--from-create') && command.id === 'init'
    if (!isFromCreate) {
      return help
    }

    const createCmd = guessCreateCommand()
    const flagSeparator = needsFlagSeparator() ? ' --' : ''

    // First replace all `sanity init` references that ends with a newline with the
    // create variant that does not include any flag separator (eg `--`). Then replace
    // the other references that do. Most package managers do not require the `--`
    // separator, but npm does. Only include it if we need to, as the commands look
    // cleaner without it.
    return help
      .replaceAll(/(\s+)sanity(\s+)init(\s*)\n/g, `$1${createCmd}$2\n`)
      .replaceAll(/(\s+)sanity(\s+)init/g, `$1${createCmd}${flagSeparator}`)
  }
}

function guessPackageManager() {
  const ua = process.env.npm_config_user_agent || ''
  if (ua.includes('pnpm')) return 'pnpm'
  if (ua.includes('yarn')) return 'yarn'
  if (ua.includes('bun')) return 'bun'
  if (ua.includes('npm')) return 'npm'
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
