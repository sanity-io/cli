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

interface TelemetryFlag {
  canonical: string
  option: boolean
  redact: boolean
}

export function collectTelemetryFlags(
  argv: string[],
  flags: Interfaces.FlagInput,
  telemetry?: CommandTelemetry,
): string[] {
  const definitions = new Map<string, TelemetryFlag>()
  for (const [name, flag] of Object.entries(flags)) {
    const canonical = `--${name}`
    const definition = {
      canonical,
      option: flag.type === 'option',
      redact: telemetry?.redactedFlags.some((entry) => entry.canonical === canonical) ?? false,
    }
    definitions.set(canonical, definition)
    for (const alias of flag.aliases ?? []) {
      definitions.set(`${alias.length === 1 ? '-' : '--'}${alias}`, definition)
    }
    for (const char of [flag.char, ...(flag.charAliases ?? [])]) {
      if (char) definitions.set(`-${char}`, definition)
    }
    if (flag.type === 'boolean' && flag.allowNo) {
      definitions.set(`--no-${name}`, {...definition, canonical: `--no-${name}`})
    }
  }

  const result: string[] = []
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--') break
    if (!argument.startsWith('-') || argument === '-') continue

    if (argument.startsWith('--')) {
      const separator = argument.indexOf('=')
      const name = separator === -1 ? argument : argument.slice(0, separator)
      const flag = definitions.get(name)
      // An unknown option may consume the next token, including a known flag's spelling.
      // Stop rather than interpreting private input as telemetry.
      if (!flag) break
      const value = separator === -1 ? undefined : argument.slice(separator + 1)
      result.push(
        flag.redact || !flag.option || value === undefined
          ? flag.canonical
          : `${flag.canonical}=${value}`,
      )
      if (flag.option && separator === -1) index++
      continue
    }

    for (let offset = 1; offset < argument.length; offset++) {
      const flag = definitions.get(`-${argument[offset]}`)
      if (!flag) return result
      if (!flag.option) {
        result.push(flag.canonical)
        continue
      }
      const value = argument.slice(offset + 1)
      result.push(
        flag.redact || !value ? flag.canonical : `${flag.canonical}=${value.replace(/^=/, '')}`,
      )
      if (!value) index++
      break
    }
  }

  return result
}
