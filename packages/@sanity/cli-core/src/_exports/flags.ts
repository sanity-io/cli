import {type Interfaces} from '@oclif/core'

const requiredWhenUnattendedSymbol = Symbol.for('@sanity/cli-core/requiredWhenUnattended')

// `Flag` is invariant in its parsed value, so `unknown` would reject concrete flag types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFlag = Interfaces.Flag<any>

type UnattendedFlag = AnyFlag & {
  [requiredWhenUnattendedSymbol]?: true
}

/** Marks an optional flag as required whenever the command is invoked in unattended mode. */
export function requiredWhenUnattended<T extends AnyFlag>(flag: T): T {
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
