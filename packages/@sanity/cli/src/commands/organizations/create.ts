import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {input, spinner} from '@sanity/cli-core/ux'

import {validateOrganizationName} from '../../actions/organizations/validateOrganizationName.js'
import {createOrganization} from '../../services/organizations.js'
import {organizationAliases} from '../../util/organizationAliases.js'

const createOrgDebug = subdebug('organizations:create')

export class CreateOrganizationCommand extends SanityCommand<typeof CreateOrganizationCommand> {
  static override args = {
    name: Args.string({
      description: 'Organization name',
      required: false,
    }),
  }

  static override description = 'Create a new organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively create an organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "Acme Corp"',
      description: 'Create an organization named "Acme Corp"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "Acme Corp" --default-role member',
      description: 'Create an organization with a default member role',
    },
  ]

  static override flags = {
    'default-role': Flags.string({
      description: 'Default role assigned to new members',
      required: false,
    }),
  } satisfies FlagInput

  static override hiddenAliases = organizationAliases('create')

  public async run(): Promise<void> {
    const {name: organizationName} = this.args
    const {'default-role': defaultRole} = this.flags

    let name: string
    if (organizationName === undefined) {
      name = await input({
        message: 'Organization name:',
        validate: validateOrganizationName,
      })
    } else {
      const validation = validateOrganizationName(organizationName)
      if (validation !== true) {
        this.error(validation, {exit: 1})
      }
      name = organizationName
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
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to create organization: ${message}`, {exit: 1})
    }
  }
}
