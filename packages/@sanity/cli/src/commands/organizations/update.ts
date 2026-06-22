import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {validateOrganizationName} from '../../actions/organizations/validateOrganizationName.js'
import {validateOrganizationSlug} from '../../actions/organizations/validateOrganizationSlug.js'
import {type OrganizationUpdateParams, updateOrganization} from '../../services/organizations.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {organizationAliases} from '../../util/organizationAliases.js'

const updateOrgDebug = subdebug('organizations:update')

const UPDATE_FLAGS = ['name', 'slug', 'default-role'] as const

export class UpdateOrganizationCommand extends SanityCommand<typeof UpdateOrganizationCommand> {
  static override args = {
    organizationId: Args.string({
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
      atLeastOne: [...UPDATE_FLAGS],
      description: 'New default role for new members',
      required: false,
    }),
    name: Flags.string({
      atLeastOne: [...UPDATE_FLAGS],
      description: 'New organization name',
      required: false,
    }),
    slug: Flags.string({
      atLeastOne: [...UPDATE_FLAGS],
      description: 'New URL slug (requires authSAML feature on the organization)',
      required: false,
    }),
  } satisfies FlagInput

  static override hiddenAliases = organizationAliases('update')

  public async run(): Promise<void> {
    const {organizationId} = this.args
    const {'default-role': defaultRole, name, slug} = this.flags

    const params: OrganizationUpdateParams = {}
    if (name !== undefined) {
      const trimmedName = name.trim()
      const validation = validateOrganizationName(trimmedName)
      if (validation !== true) {
        this.error(validation, {exit: 1})
      }
      params.name = trimmedName
    }
    if (slug !== undefined) {
      const trimmedSlug = slug.trim()
      const slugValidation = validateOrganizationSlug(trimmedSlug)
      if (slugValidation !== true) {
        this.error(slugValidation, {exit: 1})
      }
      params.slug = trimmedSlug
    }
    if (defaultRole !== undefined) {
      const trimmedRole = defaultRole.trim()
      if (trimmedRole === '') {
        this.error('Default role cannot be empty', {exit: 1})
      }
      params.defaultRoleName = trimmedRole
    }

    const spin = spinner('Updating organization').start()
    try {
      await updateOrganization(organizationId, params)
      spin.succeed()
      this.log('Organization updated')
    } catch (error) {
      spin.fail()
      updateOrgDebug('Error updating organization', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Organization "${organizationId}" not found`, {exit: 1})
      }
      this.error(`Failed to update organization: ${getErrorMessage(error)}`, {exit: 1})
    }
  }
}
