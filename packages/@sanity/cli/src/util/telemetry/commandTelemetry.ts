import {type Interfaces} from '@oclif/core'

/** @internal */
export interface CommandTelemetry {
  flags?: Partial<Record<string, TelemetryValue>>
}

type OptionFlagName<Flags extends Interfaces.FlagInput> = string &
  {
    [Name in keyof Flags]: Flags[Name] extends Interfaces.OptionFlag<unknown> ? Name : never
  }[keyof Flags]

type CommandTelemetryConfig<Flags extends Interfaces.FlagInput> = {
  flags?: Partial<Record<OptionFlagName<Flags>, TelemetryValue>>
}

/** @internal */
export interface TelemetryValue {
  normalize(value: string): string | undefined
}

/** @internal */
export function defineCommandTelemetry<const Flags extends Interfaces.FlagInput>(
  _flags: Flags,
  config: CommandTelemetryConfig<Flags>,
): CommandTelemetry {
  return config
}

/** @internal */
export const telemetry = {
  apiVersion(): TelemetryValue {
    return {
      normalize: (value) => (/^v\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined),
    }
  },

  enum<const Values extends readonly string[]>(values: Values): TelemetryValue {
    const allowedValues = new Set(values)

    return {
      normalize: (value) => (allowedValues.has(value as Values[number]) ? value : undefined),
    }
  },

  number(): TelemetryValue {
    return {
      normalize: (value) => (Number.isFinite(Number(value)) ? value : undefined),
    }
  },
}
