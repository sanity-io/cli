import {Flags} from '@oclif/core'

/**
 * Properties that callers may override when using shared flag getters.
 * Locked properties (char, parse, name, helpValue) are excluded to ensure
 * consistent behavior across all commands.
 */
interface FlagOverrides {
  dependsOn?: string[]
  description?: string
  env?: string
  exclusive?: string[]
  hidden?: boolean
  required?: boolean
}

/**
 * Returns a `--project-id` / `-p` flag definition.
 *
 * Locked: flag name (`project-id`), char (`p`), `helpValue` (`<id>`), and parse (trims + validates non-empty).
 * All other oclif flag properties (description, etc.) can be overridden.
 */
export function getProjectIdFlag(overrides?: FlagOverrides) {
  return {
    'project-id': Flags.string({
      description: 'Project ID to use (overrides CLI configuration)',
      helpValue: '<id>',
      ...overrides,
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
 * Returns a `--dataset` / `-d` flag definition.
 *
 * Locked: flag name (`dataset`), char (`d`), `helpValue` (`<name>`), and parse (trims + validates non-empty).
 * All other oclif flag properties (description, etc.) can be overridden.
 */
export function getDatasetFlag(overrides?: FlagOverrides) {
  return {
    dataset: Flags.string({
      description: 'Dataset to use (overrides CLI configuration)',
      helpValue: '<name>',
      ...overrides,
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
