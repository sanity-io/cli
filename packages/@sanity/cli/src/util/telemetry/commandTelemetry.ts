import {type Interfaces} from '@oclif/core'

interface RedactedFlag {
  canonical: string
  flags: readonly string[]
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
        flags: [
          `--${name}`,
          ...aliases.map((alias) => `${alias.length === 1 ? '-' : '--'}${alias}`),
          ...(flag?.char ? [`-${flag.char}`] : []),
          ...(flag?.charAliases ?? []).map((alias) => `-${alias}`),
        ],
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
    const redactedFlag = commandTelemetry?.redactedFlags.find(({flags}) =>
      flags.some((syntax) =>
        syntax.startsWith('--')
          ? argument === syntax || argument.startsWith(`${syntax}=`)
          : isShortOption && argument.startsWith(syntax),
      ),
    )

    return redactedFlag?.canonical ?? argument
  })
}
