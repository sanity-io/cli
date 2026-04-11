import {Flags} from '@oclif/core'

/**
 * Controls how the flag relates to CLI configuration:
 *
 * - `'override'` — The command falls back to CLI config (sanity.cli.ts) when the flag is not
 *   provided. The flag description automatically gets an " (overrides CLI configuration)" suffix,
 *   and `helpGroup` defaults to `'OVERRIDE'`.
 *
 * - `'specify'` — The command does NOT fall back to CLI config; the flag is simply how the user
 *   provides the value. No suffix is appended, and no default `helpGroup` is set.
 */
type FlagSemantics = 'override' | 'specify'

/**
 * Options accepted by the shared flag getters.
 * Locked properties (char, parse, name, helpValue) are excluded to ensure
 * consistent behavior across all commands.
 */
interface SharedFlagOptions {
  /**
   * Controls description suffix and default helpGroup.
   * @see {@link FlagSemantics}
   */
  semantics: FlagSemantics

  dependsOn?: string[]
  description?: string
  env?: string
  exclusive?: string[]
  helpGroup?: string
  hidden?: boolean
  required?: boolean
}

const OVERRIDE_SUFFIX = ' (overrides CLI configuration)'

/**
 * Returns a `--project-id` / `-p` flag definition.
 *
 * Locked: flag name (`project-id`), char (`p`), `helpValue` (`<id>`), and parse (trims + validates non-empty).
 */
export function getProjectIdFlag(options: SharedFlagOptions) {
  const {description: baseDescription, helpGroup, semantics, ...rest} = options
  const isOverride = semantics === 'override'
  const description = (baseDescription ?? 'Project ID to use') + (isOverride ? OVERRIDE_SUFFIX : '')

  return {
    'project-id': Flags.string({
      description,
      helpGroup: helpGroup ?? (isOverride ? 'OVERRIDE' : undefined),
      helpValue: '<id>',
      ...rest,
      char: 'p',
      parse: async (input: string) => {
        const trimmed = input.trim()
        if (trimmed === '') {
          throw new Error('`--project-id` cannot be empty if provided')
        }
        return trimmed
      },
    }),
  }
}

/**
 * Returns an `--org-id` / `-o` flag definition.
 *
 * Locked: flag name (`org-id`), char (`o`), `helpValue` (`<id>`), and parse (trims + validates non-empty).
 */
export function getOrgIdFlag(options: SharedFlagOptions) {
  const {description: baseDescription, helpGroup, semantics, ...rest} = options
  const isOverride = semantics === 'override'
  const description =
    (baseDescription ?? 'Organization ID to use') + (isOverride ? OVERRIDE_SUFFIX : '')

  return {
    'org-id': Flags.string({
      description,
      helpGroup: helpGroup ?? (isOverride ? 'OVERRIDE' : undefined),
      helpValue: '<id>',
      ...rest,
      char: 'o',
      parse: async (input: string) => {
        const trimmed = input.trim()
        if (trimmed === '') {
          throw new Error('`--org-id` cannot be empty if provided')
        }
        return trimmed
      },
    }),
  }
}

/**
 * Returns a `--dataset` / `-d` flag definition.
 *
 * Locked: flag name (`dataset`), char (`d`), `helpValue` (`<name>`), and parse (trims + validates non-empty).
 */
export function getDatasetFlag(options: SharedFlagOptions) {
  const {description: baseDescription, helpGroup, semantics, ...rest} = options
  const isOverride = semantics === 'override'
  const description = (baseDescription ?? 'Dataset to use') + (isOverride ? OVERRIDE_SUFFIX : '')

  return {
    dataset: Flags.string({
      description,
      helpGroup: helpGroup ?? (isOverride ? 'OVERRIDE' : undefined),
      helpValue: '<name>',
      ...rest,
      char: 'd',
      parse: async (input: string) => {
        const trimmed = input.trim()
        if (trimmed === '') {
          throw new Error('`--dataset` cannot be empty if provided')
        }
        return trimmed
      },
    }),
  }
}
