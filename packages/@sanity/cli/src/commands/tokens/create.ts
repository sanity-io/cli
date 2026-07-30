import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'

import {
  formatExpiryChoiceDate,
  formatTokenExpiry,
  getPresetExpiryDate,
  TOKEN_EXPIRY_PRESET_DAYS,
  validateExpiryDate,
} from '../../actions/tokens/expiry.js'
import {validateRole} from '../../actions/tokens/validateRole.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {createToken, getTokenRoles} from '../../services/tokens.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const tokensCreateDebug = subdebug('tokens:create')

// Default role for unattended mode; `viewer` is a built-in role present on every project
const DEFAULT_ROLE = {name: 'viewer', title: 'Viewer'}

interface SelectedRole {
  name: string
  title: string
}

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
    {
      command: '<%= config.bin %> <%= command.id %> "My Token" --expires-at 2026-12-31',
      description: 'Create a token that expires on a given date',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to create token in',
      semantics: 'override',
    }),
    'expires-at': Flags.string({
      description:
        'Expiration date for the token (YYYY-MM-DD). Omit for a token that never expires.',
      helpValue: 'YYYY-MM-DD',
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

    const selectedRole: SelectedRole = await (role
      ? validateRole(role, projectId, this.output)
      : this.promptForRole(projectId))

    const expiresAt = await this.resolveExpiry(flags['expires-at'])

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
        roleName: selectedRole.name,
        roleTitle: selectedRole.title,
      })

      if (json) {
        this.log(JSON.stringify(token, null, 2))
        return
      }

      this.log('API token created')
      this.log(`Label: ${token.label}`)
      this.log(`ID: ${token.id}`)
      this.log(`Role: ${token.roles.map((r) => r.title).join(', ')}`)
      this.log(`Expires: ${formatTokenExpiry(token.expiresAt)}`)
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

  private async promptForRole(projectId: string): Promise<SelectedRole> {
    if (this.isUnattended()) {
      return DEFAULT_ROLE
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
    return selectedRole ?? {name: selectedRoleName, title: selectedRoleName}
  }

  private async resolveExpiry(expiresAtFlag: string | undefined): Promise<string | undefined> {
    if (expiresAtFlag !== undefined) {
      const validation = validateExpiryDate(expiresAtFlag)
      if (validation !== true) {
        this.error(`Invalid \`--expires-at\` value "${expiresAtFlag}": ${validation}`, {
          exit: exitCodes.USAGE_ERROR,
        })
      }
      return expiresAtFlag
    }

    // No expiration by default, matching the Manage token creation flow
    if (this.isUnattended()) {
      return undefined
    }

    const now = new Date()
    const choice = await select({
      choices: [
        {name: 'No expiration', short: 'No expiration', value: 'none'},
        ...TOKEN_EXPIRY_PRESET_DAYS.map((days) => {
          const date = getPresetExpiryDate(days, now)
          return {
            name: `${days} days (${formatExpiryChoiceDate(date)})`,
            short: `${days} days`,
            value: String(days),
          }
        }),
        {name: 'Custom date', short: 'Custom date', value: 'custom'},
      ],
      default: 'none',
      message: 'Token expiration:',
    })

    if (choice === 'none') {
      return undefined
    }

    if (choice === 'custom') {
      const customDate = await input({
        message: 'Expiration date (YYYY-MM-DD):',
        validate: (value) => validateExpiryDate(value.trim()),
      })
      return customDate.trim()
    }

    return getPresetExpiryDate(Number(choice), now)
  }
}
