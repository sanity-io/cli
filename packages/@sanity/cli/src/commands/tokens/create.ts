import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage, isProjectRootNotFoundError} from '@sanity/cli-core/errors'
import {input, select} from '@sanity/cli-core/ux'
import {ClientError} from '@sanity/client'

import {
  MissingOrganizationError,
  resolveOrganizationId,
} from '../../actions/context/resolveOrganizationId.js'
import {expiryInDays, parseExpiryDate} from '../../actions/tokens/expiry.js'
import {
  DEFAULT_ROLE,
  formatGrant,
  getProjectTokenMembership,
  type Grant,
  parseGrant,
  projectGrantKey,
  toMemberships,
} from '../../actions/tokens/grants.js'
import {type RobotWithToken} from '../../actions/tokens/types.js'
import {validateRole} from '../../actions/tokens/validateRole.js'
import {promptForGrants} from '../../prompts/promptForGrants.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {listProjects} from '../../services/projects.js'
import {createOrganizationToken, createToken} from '../../services/tokens.js'
import {getOrganizationFlag, getProjectIdFlag} from '../../util/sharedFlags.js'

const tokensCreateDebug = subdebug('tokens:create')

// Mirrors the expiry presets offered by sanity.io/manage
const EXPIRY_PRESET_DAYS = [30, 60, 90]

const ORGANIZATION_FORBIDDEN_MESSAGE =
  'You need permission to create organization tokens. Grant a single project to create a project token instead.'

export class CreateTokenCommand extends SanityCommand<typeof CreateTokenCommand> {
  static override args = {
    label: Args.string({
      description: 'Label for the new token',
      required: false,
    }),
  }

  static override description =
    'Create a new API token with access to an organization and its projects'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> "My API Token"',
      description: 'Create a token, choosing its access interactively',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> "CI Token" --grant context=developer --grant blueprints --grant project:abc123=editor',
      description: 'Create an organization token with Context, Blueprints and project access',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My Token" --project-id abc123 --role=editor',
      description: 'Create a project token with editor role',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "CI Token" --role=editor --yes',
      description: 'Create a project token in unattended mode',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "Build Token" --expires-at 2027-01-01',
      description: 'Create a token that expires on a given date',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "API Token" --json',
      description: 'Output token information as JSON',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to create token in',
      semantics: 'override',
    }),
    ...getOrganizationFlag({
      description: 'Organization to create an organization token in',
      semantics: 'override',
    }),
    'expires-at': Flags.string({
      description: 'Date or timestamp the token expires (ISO 8601; tokens never expire by default)',
      helpValue: '2027-01-01',
    }),
    grant: Flags.string({
      description:
        'Access to grant, as <permission>[=<role>] or project:<projectId>=<role>[,<role>]. Permissions: context, blueprints, media-library, canvas, sdk-apps, access, deploy-studios. Repeatable',
      helpValue: 'context=editor',
      multiple: true,
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    role: Flags.string({
      description: 'Role to assign on the project (defaults to viewer in unattended mode)',
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

    const label = givenLabel === undefined ? await this.promptForLabel() : givenLabel.trim()
    if (!label) {
      this.error('Token label cannot be empty. Pass a non-empty value as the `<label>` argument.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const flagExpiresAt = this.parseExpiryFlag(flags['expires-at'])
    const getExpiry = async () =>
      flags['expires-at'] === undefined ? this.promptForExpiry() : flagExpiresAt
    const flagGrants = (flags.grant ?? []).map((value) => this.parseGrantFlag(value))

    let grants: Grant[]
    let expiresAt: string | undefined
    let organizationId: string | undefined
    let roleTitle: string | undefined
    if (this.isUnattended() || flagGrants.length > 0 || flags.role !== undefined) {
      const flagAccess = await this.getFlagGrants(flagGrants)
      grants = flagAccess.grants
      roleTitle = flagAccess.roleTitle
      expiresAt = await getExpiry()
    } else {
      const contextProjectId = flags['project-id'] ?? (await this.tryGetCliConfig()).api?.projectId
      const projects = await listProjects({onlyExplicitMembership: false})
      organizationId = await this.resolveOrganization(
        projects.find((project) => project.id === contextProjectId)?.organizationId,
      )
      const organizationProjects = projects.filter(
        (project) => project.organizationId === organizationId,
      )
      const requestedProjectId = flags['project-id']
      if (requestedProjectId && !organizationProjects.some(({id}) => id === requestedProjectId)) {
        this.error(
          `Project ${requestedProjectId} isn't in organization ${organizationId}, or you don't have access to it.`,
          {exit: exitCodes.USAGE_ERROR},
        )
      }
      expiresAt = await getExpiry()
      grants = await promptForGrants({
        preselectedProjectId: requestedProjectId,
        projects: organizationProjects,
      })
    }

    let token: RobotWithToken
    try {
      token = await this.createTokenForGrants({
        expiresAt,
        grants,
        label,
        organizationId,
      })
    } catch (error) {
      if (error instanceof CLIError) throw error
      tokensCreateDebug('Error creating token', error)
      this.error(`Token creation failed:\n${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (flags.json) {
      this.log(JSON.stringify(token, null, 2))
      return
    }

    this.log('API token created')
    this.log(`Label: ${token.label}`)
    this.log(`ID: ${token.id}`)
    if (roleTitle) {
      this.log(`Role: ${roleTitle}`)
    }
    if (token.expiresAt) {
      this.log(`Expires: ${token.expiresAt}`)
    }
    this.log(`Token: ${token.token}`)
    this.log('')
    this.log("Copy the token now. It won't be shown again.")

    if (!this.isUnattended()) {
      this.log('')
      this.log('To create the same token without prompts:')
      this.log(`  ${formatCreateCommand(this.config.bin, {expiresAt, grants, label, token})}`)
    }
  }

  private async createTokenForGrants(options: {
    expiresAt: string | undefined
    grants: Grant[]
    label: string
    organizationId: string | undefined
  }): Promise<RobotWithToken> {
    const {expiresAt, grants, label} = options
    const projectMembership = getProjectTokenMembership(grants)
    if (projectMembership) {
      const {resourceId: projectId, roleNames} = projectMembership
      return createToken({expiresAt, label, projectId, roleNames})
    }

    const organizationId = options.organizationId ?? (await this.resolveOrganization())
    try {
      return await createOrganizationToken({
        expiresAt,
        label,
        memberships: toMemberships(grants, organizationId),
        organizationId,
      })
    } catch (error) {
      if (error instanceof ClientError && error.statusCode === 403) {
        throw new Error(ORGANIZATION_FORBIDDEN_MESSAGE, {cause: error})
      }
      throw error
    }
  }

  private async getFlagGrants(grants: Grant[]): Promise<{grants: Grant[]; roleTitle?: string}> {
    const {'project-id': projectIdFlag, role} = this.flags
    if (grants.length > 0 && !projectIdFlag && !role) {
      return {grants}
    }

    const projectId = await this.resolveProjectId()
    const projectKey = projectGrantKey(projectId)
    if (grants.some((grant) => grant.key === projectKey)) {
      if (role) {
        this.error(
          `Set the role for project ${projectId} with either --role or --grant ${projectKey}=<role>, not both.`,
          {exit: exitCodes.USAGE_ERROR},
        )
      }
      return {grants}
    }

    const projectRole = role ? await validateRole(role, projectId, this.output) : DEFAULT_ROLE

    return {
      grants: [...grants, {key: projectKey, roles: [projectRole.name]}],
      roleTitle: grants.length === 0 ? projectRole.title : undefined,
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

  private parseGrantFlag(value: string): Grant {
    const parsed = parseGrant(value.trim())
    if ('error' in parsed) {
      this.error(parsed.error, {exit: exitCodes.USAGE_ERROR})
    }

    return parsed.grant
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

  private async resolveOrganization(projectOrganizationId?: string | null): Promise<string> {
    try {
      return await resolveOrganizationId({
        configuredOrganizationId:
          (await this.tryGetCliConfig()).app?.organizationId ?? projectOrganizationId ?? undefined,
        flagOrganizationId: this.flags.organization,
        unattended: this.isUnattended(),
      })
    } catch (error) {
      tokensCreateDebug('Error resolving organization', error)
      this.error(getErrorMessage(error), {
        exit:
          error instanceof MissingOrganizationError
            ? exitCodes.USAGE_ERROR
            : exitCodes.RUNTIME_ERROR,
      })
    }
  }

  private async resolveProjectId(): Promise<string> {
    if (!this.isUnattended()) {
      return this.getProjectId({
        fallback: () =>
          promptForProject({
            requiredPermissions: [
              {grant: 'read', permission: 'sanity.project.roles'},
              {grant: 'create', permission: 'sanity.project.tokens'},
            ],
          }),
      })
    }

    try {
      return await this.getProjectId()
    } catch (error) {
      if (!isProjectRootNotFoundError(error)) throw error
      this.error(
        'Token access is required. Pass at least one `--grant`, or `--project-id` to create a project token.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }
  }
}

function quoteShellArg(value: string): string {
  return /^[\w./:@=,-]+$/.test(value) ? value : `'${value.replaceAll("'", String.raw`'\''`)}'`
}

function formatCreateCommand(
  bin: string,
  {
    expiresAt,
    grants,
    label,
    token,
  }: {
    expiresAt: string | undefined
    grants: Grant[]
    label: string
    token: RobotWithToken
  },
): string {
  const organizationId =
    token.managedBy?.resourceType === 'organization' ? token.managedBy.resourceId : undefined
  return [
    `${bin} tokens create`,
    quoteShellArg(label),
    ...(organizationId ? [`--organization ${organizationId}`] : []),
    ...(expiresAt ? [`--expires-at ${expiresAt}`] : []),
    ...grants.map((grant) => `--grant ${formatGrant(grant)}`),
    '--yes',
  ].join(' ')
}
