import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {type ImageFile, readImageFile} from '@sanity/cli-core/images'
import {spinner} from '@sanity/cli-core/ux'

import {validateOrganizationName} from '../../actions/organizations/validateOrganizationName.js'
import {promptForOrganizationName} from '../../prompts/promptForOrganizationName.js'
import {
  createOrganization,
  type OrganizationCreateResponse,
  setOrganizationLogo,
} from '../../services/organizations.js'
import {organizationAliases} from '../../util/organizationAliases.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const createOrgDebug = subdebug('organizations:create')

export class CreateOrganizationCommand extends SanityCommand<typeof CreateOrganizationCommand> {
  static override description = 'Create a new organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively create an organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --name "Acme Corp"',
      description: 'Create an organization named "Acme Corp"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --name "Acme Corp" --default-role member',
      description: 'Create an organization with a default member role',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --name "Acme Corp" --logo ./logo.png',
      description: 'Create an organization with a logo',
    },
  ]

  static override flags = {
    'default-role': Flags.string({
      description: 'Default role assigned to new members',
      required: false,
    }),
    logo: Flags.string({
      description:
        'Image file to use as the logo: PNG, JPEG, GIF, WebP, SVG, BMP, TIFF, HEIF or AVIF, at most 5 MB',
      helpValue: '<path>',
      required: false,
    }),
    name: requiredWhenUnattended(
      Flags.string({
        description: 'Organization name',
      }),
    ),
  } satisfies FlagInput

  static override hiddenAliases = organizationAliases('create')

  static telemetry = defineCommandTelemetry(this.flags, {redact: ['logo', 'name']})

  public async run(): Promise<void> {
    const {'default-role': defaultRoleFlag, logo: logoPath, name: nameFlag} = this.flags

    const defaultRole = defaultRoleFlag?.trim()
    if (defaultRole === '') {
      this.error('Default role cannot be empty', {exit: exitCodes.RUNTIME_ERROR})
    }

    // Read the logo before creating anything, so a bad file doesn't leave an organization without it.
    let logo: ImageFile | undefined
    if (logoPath === '') {
      this.error(
        '--logo needs the path to an image file. To create the organization without a logo, leave out --logo.',
        {exit: exitCodes.RUNTIME_ERROR},
      )
    } else if (logoPath !== undefined) {
      try {
        logo = await readImageFile(logoPath)
      } catch (error) {
        this.error(getErrorMessage(error), {exit: exitCodes.RUNTIME_ERROR})
      }
    }

    let name: string
    if (nameFlag === undefined) {
      name = await promptForOrganizationName()
    } else {
      const trimmedName = nameFlag.trim()
      const validation = validateOrganizationName(trimmedName)
      if (validation !== true) {
        this.error(validation, {exit: exitCodes.RUNTIME_ERROR})
      }
      name = trimmedName
    }

    const spin = spinner('Creating organization').start()
    let org: OrganizationCreateResponse
    try {
      org = await createOrganization(name, defaultRole)
      spin.succeed('Organization created')
      this.log(`ID:   ${org.id}`)
      this.log(`Name: ${org.name}`)
    } catch (error) {
      spin.fail()
      createOrgDebug('Error creating organization', error)
      this.error(`Failed to create organization: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (!logo) return

    const logoSpin = spinner('Setting logo').start()
    try {
      const {logoUrl} = await setOrganizationLogo(org.id, logo)
      logoSpin.succeed()
      this.log(`Logo: ${logoUrl}`)
    } catch (error) {
      logoSpin.fail()
      createOrgDebug('Error setting organization logo', error)
      this.error(
        `The organization was created, but its logo wasn't set: ${getErrorMessage(error)}\nTo try again, run: ${this.config.bin} organizations update ${org.id} --logo "${logoPath}"`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
    }
  }
}
