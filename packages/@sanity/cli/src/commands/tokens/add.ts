import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {addToken} from '../../actions/tokens/addToken.js'
import {TOKENS_API_VERSION} from '../../actions/tokens/constants.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const tokensAddDebug = subdebug('tokens:add')

export class Add extends SanityCommand<typeof Add> {
  static override args = {
    label: Args.string({
      description: 'Label for the new token',
      required: false,
    }),
  }

  static override description = 'Create a new API token for this project'

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
  ]

  static override flags = {
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

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Add)
    const {label} = args
    const {json, role, yes} = flags

    const client = await this.getGlobalApiClient({
      apiVersion: TOKENS_API_VERSION,
      requireUser: true,
    })

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    try {
      tokensAddDebug(`Creating token for project ${projectId}`, {label, role, unattended: yes})

      const token = await addToken({
        client,
        label,
        projectId,
        role,
        unattended: yes,
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
}
