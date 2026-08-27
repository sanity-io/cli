import {type Interfaces} from '@oclif/core'

const requiredWhenUnattendedSymbol = Symbol.for('@sanity/cli-core/requiredWhenUnattended')

type UnattendedFlag = Interfaces.Flag<unknown> & {
  [requiredWhenUnattendedSymbol]?: true
}

/** Marks an optional flag as required whenever the command is invoked in unattended mode. */
export function requiredWhenUnattended<T extends Interfaces.Flag<unknown>>(flag: T): T {
  Object.defineProperty(flag, requiredWhenUnattendedSymbol, {value: true})
  return flag
}

export function resolveUnattendedFlagRequirements(
  flags: Interfaces.FlagInput,
  unattended: boolean,
): Interfaces.FlagInput {
  if (
    !Object.values(flags).some((flag) => (flag as UnattendedFlag)[requiredWhenUnattendedSymbol])
  ) {
    return flags
  }

  return Object.fromEntries(
    Object.entries(flags).map(([name, flag]) => [
      name,
      (flag as UnattendedFlag)[requiredWhenUnattendedSymbol]
        ? {...flag, required: unattended}
        : flag,
    ]),
  )
}
