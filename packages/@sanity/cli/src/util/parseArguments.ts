import {type Interfaces, Parser} from '@oclif/core'
import minimist from 'minimist'

import {type CommandTelemetry} from './telemetry/commandTelemetry.js'

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

function createTelemetryParserFlags(flags: Interfaces.FlagInput): Interfaces.FlagInput {
  return Object.fromEntries(
    Object.entries(flags).map(([name, flag]) => {
      const aliases = {
        aliases: flag.aliases,
        char: flag.char,
        charAliases: flag.charAliases,
      }

      if (flag.type === 'boolean') {
        return [
          name,
          {
            ...aliases,
            allowNo: flag.allowNo,
            parse: async (input: boolean) => input,
            type: 'boolean' as const,
          },
        ]
      }

      return [
        name,
        {
          ...aliases,
          input: [],
          multiple: true,
          multipleNonGreedy: true,
          parse: async (input: string) => input,
          type: 'option' as const,
        },
      ]
    }),
  ) as Interfaces.FlagInput
}

async function collectOptionArguments(
  arguments_: string[],
  flags: Interfaces.FlagInput,
  commandTelemetry: CommandTelemetry,
): Promise<string[]> {
  const parserFlags = createTelemetryParserFlags(flags)
  const {raw} = await Parser.parse(arguments_, {
    '--': true,
    args: {},
    flags: parserFlags,
    strict: false,
  })

  return raw.flatMap((token) => {
    if (token.type !== 'flag') return []

    const optionName = `--${token.flag}`
    if (parserFlags[token.flag].type === 'boolean') return optionName

    const normalizedValue = commandTelemetry.flags?.[token.flag]?.normalize(token.input)

    return normalizedValue === undefined ? optionName : `${optionName}=${normalizedValue}`
  })
}

/**
 * Parse the arguments from the command line
 *
 * @param argv - The arguments from the command line
 * @returns The parsed arguments
 */
export function parseArguments(
  argv = process.argv,
  flags: Interfaces.FlagInput = {},
  commandTelemetry: CommandTelemetry = {},
): Promise<ParsedArguments> {
  const args = argv.slice(2)
  return parseCommandArguments(args, flags, commandTelemetry, {
    isHelpCommand: args.includes('help'),
  })
}

export async function parseCommandArguments(
  args: string[],
  flags: Interfaces.FlagInput = {},
  commandTelemetry: CommandTelemetry = {},
  options: {isHelpCommand?: boolean} = {},
): Promise<ParsedArguments> {
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

  const finalExtraArguments = await collectOptionArguments(args, flags, commandTelemetry)

  // We only have global debug via env var
  const hasDebug = !!process.env.DEBUG

  return {
    groupOrCommand,

    argsWithoutOptions,
    argv: args,
    extOptions,
    extraArguments: finalExtraArguments,

    coreOptions: {
      debug: hasDebug,
      help: options.isHelpCommand ?? false,
      version,
    },
  }
}
