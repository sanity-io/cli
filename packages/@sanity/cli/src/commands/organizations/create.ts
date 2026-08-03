import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'

import {validateOrganizationName} from '../../actions/organizations/validateOrganizationName.js'
import {promptForOrganizationName} from '../../prompts/promptForOrganizationName.js'
import {createOrganization} from '../../services/organizations.js'
import {organizationAliases} from '../../util/organizationAliases.js'

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
  ]

  static override flags = {
    'default-role': Flags.string({
      description: 'Default role assigned to new members',
      required: false,
    }),
    name: Flags.string({
      description: 'Organization name',
      required: false,
    }),
  } satisfies FlagInput

  static override hiddenAliases = organizationAliases('create')

  public async run(): Promise<void> {
    const {'default-role': defaultRoleFlag, name: nameFlag} = this.flags

    const defaultRole = defaultRoleFlag?.trim()
    if (defaultRole === '') {
      this.error('Default role cannot be empty', {exit: exitCodes.RUNTIME_ERROR})
    }

    let name: string
    if (nameFlag === undefined) {
      if (this.isUnattended()) {
        this.error('Organization name is required. Provide it with the --name flag.', {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
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
    try {
      const org = await createOrganization(name, defaultRole)
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
  }
}
