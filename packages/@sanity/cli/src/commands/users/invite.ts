import {input, select} from '@sanity/cli-core/ux'
import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {USERS_API_VERSION} from '../../actions/users/apiVersion.js'
import {type Role} from '../../actions/users/types.js'
import {validateEmail} from '../../actions/users/validateEmail.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const QUOTA_ERROR_MESSAGE =
  'Project is already at user quota, add billing details to the project in order to allow overage charges.'

const usersInviteDebug = subdebug('users:invite')

export class UsersInviteCommand extends SanityCommand<typeof UsersInviteCommand> {
  static override args = {
    email: Args.string({
      description: 'Email address to invite',
      required: false,
    }),
  }

  static override description = 'Invite a new user to the project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Invite a new user to the project (prompt for details)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> pippi@sanity.io',
      description: 'Send a new user invite to the email "pippi@sanity.io", prompt for role',
    },
    {
      command: '<%= config.bin %> <%= command.id %> pippi@sanity.io --role administrator',
      description: 'Send a new user invite to the email "pippi@sanity.io", as administrator',
    },
  ]

  static override flags = {
    role: Flags.string({
      description: 'Role to invite the user as',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {email: selectedEmail} = this.args
    const {role: selectedRole} = this.flags

    const client = await this.getGlobalApiClient({
      apiVersion: USERS_API_VERSION,
      requireUser: true,
    })

    const projectId = await this.getProjectId()

    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    let roles: Role[]
    try {
      roles = (await client.request<Role[]>({uri: `/projects/${projectId}/roles`})).filter(
        (role) => role.appliesToUsers,
      )
    } catch (error) {
      usersInviteDebug('Error fetching roles', error)
      this.error('Error fetching roles', {exit: 1})
    }

    const email = selectedEmail || (await this.promptForEmail())
    const roleSelection = selectedRole || (await this.promptForRole(roles))
    const role = roles.find(({name}) => name.toLowerCase() === roleSelection.toLowerCase())

    if (!role) {
      this.error(
        `Role name "${roleSelection}" not found. Available roles: ${roles.map((r) => r.name).join(', ')}`,
        {exit: 1},
      )
    }

    try {
      await client.request({
        body: {email, role: role.name},
        maxRedirects: 0,
        method: 'POST',
        uri: `/invitations/project/${projectId}`,
        useGlobalApi: true,
      })

      this.log(`Invitation sent to ${email}`)
    } catch (error) {
      usersInviteDebug(`Error inviting user`, error)
      if ((error as Error & {statusCode: number}).statusCode === 402) {
        this.error(QUOTA_ERROR_MESSAGE, {exit: 1})
      }

      this.error(`Error inviting user`, {exit: 1})
    }
  }

  private async promptForEmail(): Promise<string> {
    return input({
      message: 'Email to invite:',
      transformer: (val: string) => val.trim(),
      validate: validateEmail,
    })
  }

  private async promptForRole(roles: Role[]): Promise<string> {
    return select({
      choices: roles.map((role) => ({
        name: `${role.title} (${role.description || 'No description'})`,
        value: role.name,
      })),
      message: 'Which role should the user have?',
    })
  }
}
