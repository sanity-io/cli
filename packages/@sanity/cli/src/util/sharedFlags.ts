import {Flags} from '@oclif/core'

/**
 * Shared `--project-id` / `-p` flag for commands that can operate on
 * a project without requiring a local Sanity project directory.
 */
export const projectIdFlag = {
  'project-id': Flags.string({
    char: 'p',
    description: 'Project ID to use. Overrides the project ID from the Sanity config.',
  }),
}
