import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type ImageFile, readImageFile} from '@sanity/cli-core/images'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {validateOrganizationName} from '../../actions/organizations/validateOrganizationName.js'
import {validateOrganizationSlug} from '../../actions/organizations/validateOrganizationSlug.js'
import {
  type OrganizationUpdateParams,
  removeOrganizationLogo,
  setOrganizationLogo,
  updateOrganization,
} from '../../services/organizations.js'
import {organizationAliases} from '../../util/organizationAliases.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const updateOrgDebug = subdebug('organizations:update')

const UPDATE_FLAGS = ['name', 'slug', 'default-role', 'logo'] as const

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
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123 --logo ./logo.png',
      description: 'Set or replace the organization logo',
    },
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123 --logo ""',
      description: 'Remove the organization logo',
    },
  ]

  static override flags = {
    'default-role': Flags.string({
      atLeastOne: [...UPDATE_FLAGS],
      description: 'New default role for new members',
      required: false,
    }),
    logo: Flags.string({
      atLeastOne: [...UPDATE_FLAGS],
      description:
        'Image file to use as the logo: PNG, JPEG, GIF, WebP, SVG, BMP, TIFF, HEIF or AVIF, at most 5 MB ("" removes it)',
      helpValue: '<path>',
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

  static telemetry = defineCommandTelemetry(this.flags, {redact: ['logo', 'name']})

  public async run(): Promise<void> {
    const {organizationId} = this.args
    const {'default-role': defaultRole, logo: logoPath, name, slug} = this.flags

    const params: OrganizationUpdateParams = {}
    if (name !== undefined) {
      const trimmedName = name.trim()
      const validation = validateOrganizationName(trimmedName)
      if (validation !== true) {
        this.error(validation, {exit: exitCodes.RUNTIME_ERROR})
      }
      params.name = trimmedName
    }
    if (slug !== undefined) {
      const trimmedSlug = slug.trim()
      const slugValidation = validateOrganizationSlug(trimmedSlug)
      if (slugValidation !== true) {
        this.error(slugValidation, {exit: exitCodes.RUNTIME_ERROR})
      }
      params.slug = trimmedSlug
    }
    if (defaultRole !== undefined) {
      const trimmedRole = defaultRole.trim()
      if (trimmedRole === '') {
        this.error('Default role cannot be empty', {exit: exitCodes.RUNTIME_ERROR})
      }
      params.defaultRoleName = trimmedRole
    }

    // undefined leaves the logo as it is, null removes it.
    let logo: ImageFile | null | undefined
    if (logoPath === '') {
      logo = null
    } else if (logoPath !== undefined) {
      try {
        logo = await readImageFile(logoPath)
      } catch (error) {
        this.error(getErrorMessage(error), {exit: exitCodes.RUNTIME_ERROR})
      }
    }

    const spin = spinner('Updating organization').start()

    const updatesFields = Object.keys(params).length > 0
    if (updatesFields) {
      try {
        await updateOrganization(organizationId, params)
      } catch (error) {
        spin.fail()
        this.failRequest(error, 'Failed to update organization')
      }
    }

    let logoUrl: string | null = null
    if (logo !== undefined) {
      try {
        const response = logo
          ? await setOrganizationLogo(organizationId, logo)
          : await removeOrganizationLogo(organizationId)
        logoUrl = response.logoUrl
      } catch (error) {
        spin.fail()
        this.failRequest(
          error,
          updatesFields
            ? `The organization was updated, but its logo wasn't ${logo ? 'set' : 'removed'}`
            : `Failed to ${logo ? 'set' : 'remove'} the organization's logo`,
        )
      }
    }

    spin.succeed()
    this.log('Organization updated')
    if (logo) {
      this.log(`Logo: ${logoUrl}`)
    } else if (logo === null) {
      this.log('Logo removed')
    }
  }

  private failRequest(error: unknown, message: string): never {
    updateOrgDebug(message, error)
    if (isHttpError(error) && error.statusCode === 404) {
      this.error(`Organization "${this.args.organizationId}" not found`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    this.error(`${message}: ${getErrorMessage(error)}`, {exit: exitCodes.RUNTIME_ERROR})
  }
}
