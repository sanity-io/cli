import {Command, Help, Interfaces} from '@oclif/core'
import {getBinCommand} from '@sanity/cli-core/package-manager'

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
    return prefixBinName(super.formatCommand(command))
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
export function prefixBinName(help: string): string {
  if (IS_README_GENERATION) return help
  const binCommand = getBinCommand()
  if (binCommand === 'sanity') return help
  return help.replaceAll('$ sanity', `$ ${binCommand}`)
}
