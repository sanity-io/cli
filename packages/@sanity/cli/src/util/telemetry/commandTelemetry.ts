import {type Interfaces} from '@oclif/core'

interface RedactedFlag {
  canonical: string
  long: readonly string[]
  short: readonly string[]
}

/** @internal */
export interface CommandTelemetry {
  redactedFlags: readonly RedactedFlag[]
}

type OptionFlagName<Flags extends Interfaces.FlagInput> = string &
  {
    [Name in keyof Flags]: Flags[Name] extends {type: 'option'} ? Name : never
  }[keyof Flags]

type CommandTelemetryConfig<Flags extends Interfaces.FlagInput> = {
  redact?: readonly OptionFlagName<Flags>[]
}

/** @internal */
export function defineCommandTelemetry<const Flags extends Interfaces.FlagInput>(
  flags: Flags,
  config: CommandTelemetryConfig<Flags>,
): CommandTelemetry {
  return {
    redactedFlags: (config.redact ?? []).map((name) => {
      const flag = flags[name]
      const aliases = flag?.aliases ?? []

      return {
        canonical: `--${name}`,
        long: [name, ...aliases.filter((alias) => alias.length > 1)].map((alias) => `--${alias}`),
        short: [
          flag?.char,
          ...(flag?.charAliases ?? []),
          ...aliases.filter((alias) => alias.length === 1),
        ]
          .filter(Boolean)
          .map((alias) => `-${alias}`),
      }
    }),
  }
}

export function redactTelemetryArguments(
  arguments_: string[],
  commandTelemetry?: CommandTelemetry,
): string[] {
  let forwarding = false

  return arguments_.map((argument) => {
    if (argument === '--') {
      forwarding = true
      return argument
    }

    if (forwarding) return argument

    const isShortOption = argument.startsWith('-') && !argument.startsWith('--')
    const redactedFlag = commandTelemetry?.redactedFlags.find(
      ({long, short}) =>
        long.some((syntax) => argument === syntax || argument.startsWith(`${syntax}=`)) ||
        (isShortOption &&
          short.some((syntax) => argument === syntax || argument.startsWith(syntax))),
    )

    return redactedFlag?.canonical ?? argument
  })
}
