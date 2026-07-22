import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {getOrganization} from '../../services/organizations.js'
import {organizationAliases} from '../../util/organizationAliases.js'

const getOrgDebug = subdebug('organizations:get')

export class GetOrganizationCommand extends SanityCommand<typeof GetOrganizationCommand> {
  static override args = {
    organizationId: Args.string({
      description: 'Organization ID',
      required: true,
    }),
  }

  static override description = 'Get details of an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123',
      description: 'Get details of a specific organization',
    },
  ]

  static override hiddenAliases = organizationAliases('get')

  public async run(): Promise<void> {
    const {organizationId} = this.args

    let org
    try {
      org = await getOrganization(organizationId)
    } catch (error) {
      getOrgDebug('Error getting organization', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Organization "${organizationId}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }
      this.error(`Failed to get organization: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    this.log(`ID:           ${org.id}`)
    this.log(`Name:         ${org.name}`)
    this.log(`Slug:         ${org.slug ?? '-'}`)
    this.log(`Default role: ${org.defaultRoleName ?? '-'}`)
    this.log(`Created:      ${org.createdAt}`)
    this.log(`Updated:      ${org.updatedAt}`)
  }
}
