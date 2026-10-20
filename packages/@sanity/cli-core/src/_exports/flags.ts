import {type Interfaces} from '@oclif/core'

import {getCliConfig} from '../config/cli/getCliConfig.js'
import {type CliConfig} from '../config/cli/types/cliConfig.js'
import {findProjectRoot} from '../config/findProjectRoot.js'

const requiredWhenUnattendedSymbol = Symbol.for('@sanity/cli-core/requiredWhenUnattended')
const mcpOverridesSymbol = Symbol.for('@sanity/cli-core/mcpOverrides')
const fromCliConfigSymbol = Symbol.for('@sanity/cli-core/fromCliConfig')

// `Flag` is invariant in its parsed value, so `unknown` would reject concrete flag types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFlag = Interfaces.Flag<any>

type UnattendedFlag = AnyFlag & {
  [requiredWhenUnattendedSymbol]?: true
}

export type McpFlagOverrides = {
  description?: string
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

/**
 * Marks a flag whose value falls back to the project's CLI config
 * (`sanity.cli.ts`) when omitted in a terminal: spread into the flag options,
 * it supplies oclif's `default`/`defaultHelp`. Programmatic invocations never
 * read local config — project-root resolution refuses under an execution
 * context — so generated MCP schemas mark tagged flags required instead
 * ({@link isFromCliConfig}). `noCacheDefault` keeps the building machine's
 * value out of the oclif manifest.
 */
export function fromCliConfig(read: (config: CliConfig) => string | undefined) {
  const resolve = async (): Promise<string | undefined> => {
    try {
      const root = await findProjectRoot(process.cwd())
      return read(await getCliConfig(root.directory))
    } catch {
      // No project, no config, or a programmatic invocation: the flag simply
      // has no default, and the command's own fallback (prompt/error) applies.
      return undefined
    }
  }
  return {
    default: resolve,
    defaultHelp: resolve,
    [fromCliConfigSymbol]: true,
    noCacheDefault: true,
  } as const
}

/** Whether {@link fromCliConfig} marked the flag as CLI-config-defaulted. */
export function isFromCliConfig(flag: AnyFlag | undefined): boolean {
  return (
    (flag as (AnyFlag & {[fromCliConfigSymbol]?: true}) | undefined)?.[fromCliConfigSymbol] === true
  )
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
