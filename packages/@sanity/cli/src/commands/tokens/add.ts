import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'

import {validateRole} from '../../actions/tokens/validateRole.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {createToken, getTokenRoles} from '../../services/tokens.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const tokensAddDebug = subdebug('tokens:add')

export class AddTokenCommand extends SanityCommand<typeof AddTokenCommand> {
  static override args = {
    label: Args.string({
      description: 'Label for the new token',
      required: false,
    }),
  }

  static override description = 'Create a new API token for the project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> "My API Token"',
      description: 'Create a token with a label',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My API Token" --role=editor',
      description: 'Create a token with editor role',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "CI Token" --role=editor --yes',
      description: 'Create a token in unattended mode',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "API Token" --json',
      description: 'Output token information as JSON',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My Token" --project-id abc123 --role=editor',
      description: 'Create a token for a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({description: 'Project ID to add token to', semantics: 'override'}),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    role: Flags.string({
      description: 'Role to assign to the token',
      helpValue: 'viewer',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip prompts and use defaults (unattended mode)',
    }),
  }

  static override hiddenAliases: string[] = ['token:add']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(AddTokenCommand)
    const {label: givenLabel} = args
    const {json, role} = flags

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.roles'},
            {grant: 'create', permission: 'sanity.project.tokens'},
          ],
        }),
    })

    try {
      const label = givenLabel || (await this.promptForLabel())
      const roleName = await (role ? validateRole(role, projectId) : this.promptForRole(projectId))

      tokensAddDebug(`Creating token for project ${projectId}`, {label, roleName})
      const token = await createToken({
        label,
        projectId,
        roleName,
      })

      if (json) {
        this.log(JSON.stringify(token, null, 2))
        return
      }

      this.log('Token created successfully!')
      this.log(`Label: ${token.label}`)
      this.log(`ID: ${token.id}`)
      this.log(`Role: ${token.roles.map((r) => r.title).join(', ')}`)
      this.log(`Token: ${token.key}`)
      this.log('')
      this.log('Copy the token above – this is your only chance to do so!')
    } catch (error) {
      const err = error as Error

      tokensAddDebug(`Error creating token for project ${projectId}`, err)
      this.error(`Token creation failed:\n${err.message}`, {exit: 1})
    }
  }

  private async promptForLabel(): Promise<string> {
    if (this.isUnattended()) {
      this.error(
        'Token label is required in non-interactive mode. Provide a label as an argument.',
        {
          exit: 1,
        },
      )
    }

    const label = await input({
      message: 'Token label:',
      validate: (value) => {
        if (!value || !value.trim()) {
          return 'Label cannot be empty'
        }
        return true
      },
    })

    return label
  }

  private async promptForRole(projectId: string): Promise<string> {
    if (this.isUnattended()) {
      return 'viewer' // Default role for unattended mode
    }

    const roles = await getTokenRoles(projectId)
    const robotRoles = roles.filter((role) => role.appliesToRobots)

    tokensAddDebug('Robot roles', {robotRoles})

    if (robotRoles.length === 0) {
      this.error('No roles available for tokens', {exit: 1})
    }

    const selectedRoleName = await select({
      choices: robotRoles.map((role) => ({
        name: `${role.title} (${role.name})`,
        short: role.title,
        value: role.name,
      })),
      default: 'viewer',
      message: 'Select role for the token:',
    })

    return selectedRoleName
  }
}
