import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'

import {expiryInDays, parseExpiryDate} from '../../actions/tokens/expiry.js'
import {type SelectedTokenRole} from '../../actions/tokens/types.js'
import {validateRole} from '../../actions/tokens/validateRole.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {createToken, getTokenRoles} from '../../services/tokens.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const tokensCreateDebug = subdebug('tokens:create')

// Mirrors the expiry presets offered by sanity.io/manage
const EXPIRY_PRESET_DAYS = [30, 60, 90]

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
      command: '<%= config.bin %> <%= command.id %> "Build Token" --expires-at 2027-01-01',
      description: 'Create a token that expires on a given date',
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
    'expires-at': Flags.string({
      description: 'Date or timestamp the token expires (ISO 8601; tokens never expire by default)',
      helpValue: '2027-01-01',
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

    const flagExpiresAt = this.parseExpiryFlag(flags['expires-at'])

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.roles'},
            {grant: 'create', permission: 'sanity.project.tokens'},
          ],
        }),
    })

    const selectedRole = await (role
      ? validateRole(role, projectId, this.output)
      : this.promptForRole(projectId))

    const expiresAt =
      flags['expires-at'] === undefined ? await this.promptForExpiry() : flagExpiresAt

    try {
      tokensCreateDebug(`Creating token for project ${projectId}`, {
        expiresAt,
        label,
        roleName: selectedRole.name,
      })
      const token = await createToken({
        expiresAt,
        label,
        projectId,
        role: selectedRole,
      })

      if (json) {
        this.log(JSON.stringify(token, null, 2))
        return
      }

      this.log('API token created')
      this.log(`Label: ${token.label}`)
      this.log(`ID: ${token.id}`)
      this.log(`Role: ${selectedRole.title}`)
      if (token.expiresAt) {
        this.log(`Expires: ${token.expiresAt}`)
      }
      this.log(`Token: ${token.token}`)
      this.log('')
      this.log("Copy the token now. It won't be shown again.")
    } catch (error) {
      const err = error as Error

      tokensCreateDebug(`Error creating token for project ${projectId}`, err)
      this.error(`Token creation failed:\n${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private parseExpiryFlag(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined
    }

    const parsed = parseExpiryDate(value)
    if ('error' in parsed) {
      this.error(parsed.error, {exit: exitCodes.USAGE_ERROR})
    }

    return parsed.expiresAt
  }

  private async promptForExpiry(): Promise<string | undefined> {
    if (this.isUnattended()) {
      return undefined // Tokens never expire by default
    }

    const choice = await select({
      choices: [
        {name: 'Never', value: 'never'},
        ...EXPIRY_PRESET_DAYS.map((days) => ({
          name: `${days} days (${expiryInDays(days).slice(0, 10)})`,
          value: String(days),
        })),
        {name: 'Custom date', value: 'custom'},
      ],
      default: 'never',
      message: 'Token expiry:',
    })

    if (choice === 'never') {
      return undefined
    }

    if (choice === 'custom') {
      const value = await input({
        message: 'Expiry date (ISO 8601, e.g. 2027-01-01):',
        validate: (input) => {
          const parsed = parseExpiryDate(input.trim())
          return 'error' in parsed ? parsed.error : true
        },
      })
      const parsed = parseExpiryDate(value.trim())
      return 'error' in parsed ? undefined : parsed.expiresAt
    }

    return expiryInDays(Number(choice))
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

  private async promptForRole(projectId: string): Promise<SelectedTokenRole> {
    if (this.isUnattended()) {
      return {name: 'viewer', title: 'Viewer'} // Default role for unattended mode
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

    const selectedRole = robotRoles.find((r) => r.name === selectedRoleName)
    if (!selectedRole) {
      this.error('No roles available for tokens', {exit: exitCodes.RUNTIME_ERROR})
    }

    return {name: selectedRole.name, title: selectedRole.title}
  }
}
