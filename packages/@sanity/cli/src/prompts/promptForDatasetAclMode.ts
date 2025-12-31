import {type Output} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'
import {type DatasetAclMode} from '@sanity/client'

/**
 * Prompts the user to select a dataset ACL mode (visibility)
 *
 * @param output - Optional output instance for logging additional information
 * @returns Promise resolving to the selected ACL mode
 */
export async function promptForDatasetAclMode(output?: Output): Promise<DatasetAclMode> {
  const mode = await select({
    choices: [
      {
        name: 'Public (world readable)',
        value: 'public' as const,
      },
      {
        name: 'Private (Authenticated user or token needed)',
        value: 'private' as const,
      },
    ],
    message: 'Dataset visibility',
  })

  if (mode === 'private' && output) {
    output.warn(
      'Please note that while documents are private, assets (files and images) are still public',
    )
  }

  return mode
}
