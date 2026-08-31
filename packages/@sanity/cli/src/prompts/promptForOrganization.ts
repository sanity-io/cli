import {select} from '@sanity/cli-core/ux'

import {listOrganizations} from '../services/organizations.js'

/**
 * Prompt the user to select one of their organizations, returning its ID.
 */
export async function promptForOrganization(): Promise<string> {
  const organizations = await listOrganizations()

  if (organizations.length === 0) {
    throw new Error('No organizations found. Create one with `sanity organizations create` first.')
  }

  return select({
    choices: organizations.map((org) => ({
      name: `${org.name} (${org.id})`,
      value: org.id,
    })),
    message: 'Select organization:',
  })
}
