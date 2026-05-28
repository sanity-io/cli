import {isInteractive, NonInteractiveError, subdebug} from '@sanity/cli-core'
import {select, spinner} from '@sanity/cli-core/ux'

import {listOrganizations} from '../services/organizations.js'

const debug = subdebug('prompt:organization')

/**
 * Prompt the user to select an organization from their available organizations.
 *
 * Throws NonInteractiveError if the terminal is not interactive.
 */
export async function promptForOrganization(): Promise<string> {
  if (!isInteractive()) {
    throw new NonInteractiveError('select')
  }

  debug('Fetching organizations')
  const spin = spinner('Fetching available organizations').start()

  let organizations: Awaited<ReturnType<typeof listOrganizations>>
  try {
    organizations = await listOrganizations()
  } catch (error) {
    spin.fail('Failed to fetch organizations')
    throw error
  }

  if (organizations.length === 0) {
    spin.fail('No organizations found')
    throw new Error('No organizations found. Create one at https://www.sanity.io/manage')
  }

  spin.succeed()

  return select({
    choices: organizations.map((org) => ({
      name: `${org.name} (${org.id})`,
      value: org.id,
    })),
    message: 'Select organization',
  })
}
