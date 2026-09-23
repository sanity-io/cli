import {type Interfaces} from '@oclif/core'

const requiredWhenUnattendedSymbol = Symbol.for('@sanity/cli-core/requiredWhenUnattended')
const mcpOverridesSymbol = Symbol.for('@sanity/cli-core/mcpOverrides')

// `Flag` is invariant in its parsed value, so `unknown` would reject concrete flag types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFlag = Interfaces.Flag<any>

type UnattendedFlag = AnyFlag & {
  [requiredWhenUnattendedSymbol]?: true
}

export type McpFlagOverrides = {
  description?: string
  required?: boolean
}

type McpAwareFlag = AnyFlag & {
  [mcpOverridesSymbol]?: McpFlagOverrides
}

/**
 * Annotates a flag with its deviations on the MCP tool surface. The flag
 * definition itself stays the complete CLI truth; anything omitted here is
 * inherited from it.
 */
export function mcpOverrides<T extends AnyFlag>(flag: T, overrides: McpFlagOverrides): T {
  // Plain assignment keeps the symbol enumerable so `{...flag}` copies carry
  // it; JSON serialization still ignores symbol keys.
  ;(flag as McpAwareFlag)[mcpOverridesSymbol] = overrides
  return flag
}

/** The MCP-surface overrides set by {@link mcpOverrides}, if any. */
export function mcpFlagOverrides(flag: AnyFlag | undefined): McpFlagOverrides | undefined {
  return (flag as McpAwareFlag | undefined)?.[mcpOverridesSymbol]
}

/** Marks an optional flag as required whenever the command is invoked in unattended mode. */
export function requiredWhenUnattended<T extends AnyFlag>(flag: T): T {
  ;(flag as UnattendedFlag)[requiredWhenUnattendedSymbol] = true
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
