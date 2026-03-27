import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {validateOrganizationName} from '../../actions/organizations/validateOrganizationName.js'
import {type OrganizationUpdateParams, updateOrganization} from '../../services/organizations.js'
import {hasStatusCode} from '../../util/apiError.js'

const updateOrgDebug = subdebug('organizations:update')

export class UpdateOrganizationCommand extends SanityCommand<typeof UpdateOrganizationCommand> {
  static override args = {
    orgId: Args.string({
      description: 'Organization ID',
      required: true,
    }),
  }

  static override description = 'Update an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123 --name "New Name"',
      description: 'Rename an organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123 --slug new-slug',
      description: 'Set the organization slug (requires authSAML feature)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123 --default-role viewer',
      description: 'Change the default member role',
    },
  ]

  static override flags = {
    'default-role': Flags.string({
      description: 'New default role for new members',
      required: false,
    }),
    name: Flags.string({
      description: 'New organization name',
      required: false,
    }),
    slug: Flags.string({
      description: 'New URL slug (requires authSAML feature on the organization)',
      required: false,
    }),
  } satisfies FlagInput

  static override hiddenAliases = [
    'organization:update',
    'organisations:update',
    'organisation:update',
    'org:update',
    'orgs:update',
  ]

  public async run(): Promise<void> {
    const {orgId} = this.args
    const {'default-role': defaultRole, name, slug} = this.flags

    const params: OrganizationUpdateParams = {}
    if (name !== undefined) {
      const validation = validateOrganizationName(name)
      if (validation !== true) {
        this.error(validation, {exit: 1})
      }
      params.name = name
    }
    if (slug !== undefined) params.slug = slug
    if (defaultRole !== undefined) params.defaultRoleName = defaultRole

    if (Object.keys(params).length === 0) {
      this.error('Provide at least one flag to update: --name, --slug, --default-role', {exit: 1})
    }

    const spin = spinner('Updating organization').start()
    try {
      await updateOrganization(orgId, params)
      spin.succeed()
      this.log('Organization updated')
    } catch (error) {
      spin.fail()
      updateOrgDebug('Error updating organization', error)
      if (hasStatusCode(error) && error.statusCode === 404) {
        this.error(`Organization "${orgId}" not found`, {exit: 1})
      }
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to update organization: ${message}`, {exit: 1})
    }
  }
}
