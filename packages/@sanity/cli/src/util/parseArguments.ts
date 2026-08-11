import minimist from 'minimist'

interface ParsedArguments<F = Record<string, string>> {
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

const SENSITIVE_TELEMETRY_OPTIONS = ['--file', '--filename'] as const

function getSensitiveTelemetryOption(argument: string): string | undefined {
  return SENSITIVE_TELEMETRY_OPTIONS.find(
    (option) => argument === option || argument.startsWith(`${option}=`),
  )
}

function redactSensitiveTelemetryValues(arguments_: string[]): string[] {
  const redactedArguments: string[] = []

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    const sensitiveOption = getSensitiveTelemetryOption(argument)

    if (!sensitiveOption) {
      redactedArguments.push(argument)
      continue
    }

    redactedArguments.push(sensitiveOption)
    if (argument === sensitiveOption) index += 1
  }

  return redactedArguments
}

function collectOptionArguments(arguments_: string[]): string[] {
  const optionArguments: string[] = []

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    const sensitiveOption = getSensitiveTelemetryOption(argument)

    if (sensitiveOption) {
      optionArguments.push(sensitiveOption)
      if (argument === sensitiveOption) index += 1
      continue
    }

    if (argument.startsWith('-')) optionArguments.push(argument)
  }

  return optionArguments
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

  const argumentSeparatorIndex = args.indexOf('--')
  const argumentsBeforeSeparator =
    argumentSeparatorIndex === -1 ? args : args.slice(0, argumentSeparatorIndex)
  const finalExtraArguments = [
    ...redactSensitiveTelemetryValues(extraArguments || []),
    ...collectOptionArguments(argumentsBeforeSeparator),
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
