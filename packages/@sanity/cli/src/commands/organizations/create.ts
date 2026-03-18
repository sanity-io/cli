import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {input, spinner} from '@sanity/cli-core/ux'

import {validateOrganizationName} from '../../actions/organizations/validateOrganizationName.js'
import {createOrganization} from '../../services/organizations.js'

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
      command: '<%= config.bin %> <%= command.id %> --name "Acme Corp" --default-role viewer',
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

  static override hiddenAliases = [
    'organization:create',
    'organisations:create',
    'organisation:create',
    'org:create',
    'orgs:create',
  ]

  public async run(): Promise<void> {
    const {'default-role': defaultRole, name: nameFlag} = this.flags

    const name =
      nameFlag ||
      (await input({
        message: 'Organization name:',
        validate: validateOrganizationName,
      }))

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
