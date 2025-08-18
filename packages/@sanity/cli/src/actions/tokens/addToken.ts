import {input, select} from '@inquirer/prompts'
import {isInteractive} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

import {type ProjectRole, type TokenResponse} from './types.js'

interface AddTokenOptions {
  client: SanityClient
  projectId: string

  label?: string
  role?: string
  unattended?: boolean
}

export async function addToken(options: AddTokenOptions): Promise<TokenResponse> {
  const {client, label: givenLabel, projectId, role, unattended} = options

  const label = givenLabel || (await promptForLabel(unattended))
  const roleName = await (role
    ? validateRole(role, client, projectId)
    : promptForRole(client, projectId, unattended))

  const response = await client.request<TokenResponse>({
    body: {label, roleName},
    method: 'POST',
    uri: `/projects/${projectId}/tokens`,
  })

  return response
}

async function promptForLabel(unattended?: boolean): Promise<string> {
  if (unattended || !isInteractive) {
    throw new Error(
      'Token label is required in non-interactive mode. Provide a label as an argument.',
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

async function promptForRole(client: SanityClient, projectId: string, unattended?: boolean): Promise<string> {
  if (unattended || !isInteractive) {
    return 'viewer' // Default role for unattended mode
  }

  const roles = await client.request<ProjectRole[]>({uri: `/projects/${projectId}/roles`})
  const robotRoles = roles.filter((role) => role.appliesToRobots)

  if (robotRoles.length === 0) {
    throw new Error('No roles available for tokens')
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

async function validateRole(roleName: string, client: SanityClient, projectId: string): Promise<string> {
  const roles = await client.request<ProjectRole[]>({uri: `/projects/${projectId}/roles`})
  const robotRoles = roles.filter((role) => role.appliesToRobots)

  const role = robotRoles.find((r) => r.name === roleName)
  if (!role) {
    const availableRoles = robotRoles.map((r) => r.name).join(', ')
    throw new Error(`Invalid role "${roleName}". Available roles: ${availableRoles}`)
  }

  return roleName
}
