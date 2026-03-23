/**
 * Converts POJO flag/arg definitions into oclif `FlagInput`/`ArgInput` objects.
 *
 * This file is only imported by `InitCommand` (the oclif command), not by
 * `create-sanity`'s standalone entry point, so it's fine to import from `@oclif/core` here.
 */
import {string as stringArg} from '@oclif/core/args'
import {boolean as booleanFlag, string as stringFlag} from '@oclif/core/flags'
import {type ArgInput, type FlagInput} from '@oclif/core/interfaces'

import {type ArgDef, type FlagDef} from '../actions/init/flags.js'

type OclifChar = Parameters<typeof booleanFlag>[0] extends {char?: infer C} ? C : never

/**
 * Convert POJO flag definitions into oclif `FlagInput`.
 */
export function toOclifFlags(defs: Record<string, FlagDef>): FlagInput {
  const result: FlagInput = {}

  for (const [name, def] of Object.entries(defs)) {
    if (def.type === 'boolean') {
      result[name] = booleanFlag({
        ...(def.allowNo !== undefined && {allowNo: def.allowNo}),
        ...(def.default !== undefined && {default: def.default as boolean}),
        ...(def.deprecated && {deprecated: def.deprecated}),
        ...(def.description !== undefined && {description: def.description}),
        ...(def.exclusive !== undefined && {exclusive: def.exclusive}),
        ...(def.helpGroup !== undefined && {helpGroup: def.helpGroup}),
        ...(def.helpLabel !== undefined && {helpLabel: def.helpLabel}),
        ...(def.hidden !== undefined && {hidden: def.hidden}),
        ...(def.short !== undefined && {char: def.short as OclifChar}),
      })
    } else if (def.type === 'string') {
      result[name] = stringFlag({
        ...(def.aliases !== undefined && {aliases: def.aliases}),
        ...(def.default !== undefined && {default: def.default as string}),
        ...(def.deprecated && {deprecated: def.deprecated}),
        ...(def.description !== undefined && {description: def.description}),
        ...(def.exclusive !== undefined && {exclusive: def.exclusive}),
        ...(def.helpGroup !== undefined && {helpGroup: def.helpGroup}),
        ...(def.helpLabel !== undefined && {helpLabel: def.helpLabel}),
        ...(def.helpValue !== undefined && {helpValue: def.helpValue}),
        ...(def.hidden !== undefined && {hidden: def.hidden}),
        ...(def.options !== undefined && {options: def.options}),
        ...(def.short !== undefined && {char: def.short as OclifChar}),
        // Disambiguate the oclif overload - we only support single-value string flags
        multiple: false,
      })
    } else {
      throw new Error(`Unknown flag type "${def.type}" for flag "${name}"`)
    }
  }

  return result
}

/**
 * Convert POJO arg definitions into oclif `ArgInput`.
 */
export function toOclifArgs(defs: Record<string, ArgDef>): ArgInput {
  const result: ArgInput = {}

  for (const [name, def] of Object.entries(defs)) {
    result[name] = stringArg({
      ...(def.description !== undefined && {description: def.description}),
      ...(def.hidden !== undefined && {hidden: def.hidden}),
    })
  }

  return result
}
