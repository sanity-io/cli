import minimist from 'minimist'

export interface ParsedArguments<F = Record<string, string>> {
  /**
   * Command arguments, eg any arguments after `sanity <command>` (no flags)
   */
  argsWithoutOptions: string[]

  // Raw, forwarded arguments, for commands that want to be more explicit about parsing
  argv: string[]

  /**
   * Options mostly relevant for the core CLI runner
   */
  coreOptions: {
    debug: boolean

    help: boolean

    version: boolean
  }

  /**
   * Command flags, without the core options (help, debug, version etc)
   */
  extOptions: F

  /**
   * Arguments after the ended argument list (--)
   */
  extraArguments: string[]

  /**
   * Group or command name, eg `dataset` (`sanity dataset`) or `import` (`sanity dataset import`)
   */
  groupOrCommand: string
}

/**
 * Parse the arguments from the command line
 *
 * @param argv - The arguments from the command line
 * @returns The parsed arguments
 */
export function parseArguments(argv = process.argv): ParsedArguments {
  const args = argv.slice(2)

  const {
    '--': extraArguments,
    _,
    version,
    ...extOptions
  } = minimist(args, {
    '--': true,
    boolean: ['version'],
    string: ['_'],
  })

  const [groupOrCommand, ...argsWithoutOptions] = _

  const finalExtraArguments = [
    ...(extraArguments || []),
    ...argv.filter((arg) => arg.startsWith('-')),
  ]

  // oclif allows to run `sanity help` or `sanity help <command>`
  // It does not fire the hooks on `--help` so this is okay to track
  const hasHelp = args.includes('help')

  // We only have global debug via env var
  const hasDebug = !!process.env.DEBUG

  return {
    groupOrCommand,

    argsWithoutOptions,
    argv,
    extOptions,
    extraArguments: finalExtraArguments,

    coreOptions: {
      debug: hasDebug,
      help: hasHelp,
      version,
    },
  }
}
