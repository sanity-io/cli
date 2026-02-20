import {type Output} from '@sanity/cli-core'
import {type DatasetAclMode} from '@sanity/client'

import {promptForDatasetAclMode} from '../../prompts/promptForDatasetAclMode.js'

/**
 * Options for determining the ACL mode for a dataset
 */
interface DetermineDatasetAclModeOptions {
  /**
   * Whether the project has the capability to create private datasets
   */
  canCreatePrivate: boolean
  /**
   * Output instance for logging warnings
   */
  output: Output

  /**
   * Whether to run in unattended mode (no prompts)
   */
  isUnattended?: boolean
  /**
   * Requested visibility mode from flags/options
   */
  visibility?: string
}

/**
 * Determines the appropriate ACL mode for a dataset based on project capabilities
 * and user preferences.
 *
 * This action handles the business logic for:
 * - Validating requested visibility against project capabilities
 * - Falling back to public when private is not available
 * - Prompting user when necessary
 * - Warning user about limitations
 *
 * @param options - Configuration options
 * @returns Promise resolving to the determined ACL mode
 */
export async function determineDatasetAclMode(
  options: DetermineDatasetAclModeOptions,
): Promise<DatasetAclMode> {
  const {canCreatePrivate, isUnattended = false, output, visibility} = options

  // Handle explicit custom/public requests
  if (visibility === 'custom' || visibility === 'public') {
    return visibility
  }

  // Handle private visibility request
  if (visibility === 'private') {
    if (canCreatePrivate) {
      return 'private'
    }

    output.warn('Private datasets are not available for this project. Creating as public.')

    return 'public'
  }

  // No explicit request - determine based on capabilities and mode
  if (isUnattended || !canCreatePrivate) {
    return 'public'
  }

  // Interactive mode with private capability - prompt user
  return promptForDatasetAclMode(output)
}
