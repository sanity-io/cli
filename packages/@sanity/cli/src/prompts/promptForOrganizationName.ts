import {type SanityOrgUser} from '@sanity/cli-core'
import {input} from '@sanity/cli-core/ux'

import {validateOrganizationName} from '../actions/organizations/validateOrganizationName.js'

export async function promptForOrganizationName(user?: SanityOrgUser): Promise<string> {
  return input({
    default: user?.name,
    message: 'Organization name:',
    validate: validateOrganizationName,
  })
}
