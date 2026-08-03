import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'

import {validateRole} from '../../actions/tokens/validateRole.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {createToken, getTokenRoles} from '../../services/tokens.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const tokensCreateDebug = subdebug('tokens:create')

export class CreateTokenCommand extends SanityCommand<typeof CreateTokenCommand> {
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
    ...getProjectIdFlag({
      description: 'Project ID to create token in',
      semantics: 'override',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    role: Flags.string({
      description: 'Role to assign to the token (defaults to viewer in unattended mode)',
      helpValue: 'viewer',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip prompts and use defaults (unattended mode)',
    }),
  }

  static override hiddenAliases: string[] = ['tokens:add', 'token:add', 'token:create']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CreateTokenCommand)
    const {label: givenLabel} = args
    const {json, role} = flags

    const label = givenLabel === undefined ? await this.promptForLabel() : givenLabel.trim()
    if (!label) {
      this.error('Token label cannot be empty. Pass a non-empty value as the `<label>` argument.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.roles'},
            {grant: 'create', permission: 'sanity.project.tokens'},
          ],
        }),
    })

    const roleName = await (role
      ? validateRole(role, projectId, this.output)
      : this.promptForRole(projectId))

    try {
      tokensCreateDebug(`Creating token for project ${projectId}`, {
        label,
        roleName,
      })
      const token = await createToken({
        label,
        projectId,
        roleName,
      })

      if (json) {
        this.log(JSON.stringify(token, null, 2))
        return
      }

      this.log('API token created')
      this.log(`Label: ${token.label}`)
      this.log(`ID: ${token.id}`)
      this.log(`Role: ${token.roles.map((r) => r.title).join(', ')}`)
      this.log(`Token: ${token.key}`)
      this.log('')
      this.log("Copy the token now. It won't be shown again.")
    } catch (error) {
      const err = error as Error

      tokensCreateDebug(`Error creating token for project ${projectId}`, err)
      this.error(`Token creation failed:\n${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private async promptForLabel(): Promise<string> {
    if (this.isUnattended()) {
      this.error('Token label is required. Pass it as the `<label>` argument.', {
        exit: exitCodes.USAGE_ERROR,
      })
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

    return label.trim()
  }

  private async promptForRole(projectId: string): Promise<string> {
    if (this.isUnattended()) {
      return 'viewer' // Default role for unattended mode
    }

    const roles = await getTokenRoles(projectId)
    const robotRoles = roles.filter((role) => role.appliesToRobots)

    tokensCreateDebug('Robot roles', {robotRoles})

    if (robotRoles.length === 0) {
      this.error('No roles available for tokens', {exit: exitCodes.RUNTIME_ERROR})
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
