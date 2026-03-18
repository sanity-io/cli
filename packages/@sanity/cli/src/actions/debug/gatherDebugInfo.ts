import {access} from 'node:fs/promises'
import path from 'node:path'

import {
  getCliToken,
  getStudioConfig,
  getUserConfig,
  tryFindStudioConfigPath,
} from '@sanity/cli-core'

import {getProjectById} from '../../services/projects.js'
import {getCliUser, getProjectUser} from '../../services/user.js'
import {getCliVersion} from '../../util/getCliVersion.js'
import {detectCliInstallation} from '../../util/packageManager/installationInfo/index.js'
import {
  type AuthInfo,
  type CliInfo,
  type ProjectInfo,
  type ResolvedWorkspace,
  type StudioWorkspace,
  type UserInfo,
} from './types.js'

export async function gatherUserInfo(projectId: string | undefined): Promise<Error | UserInfo> {
  const token = await getCliToken()
  if (!token) {
    return new Error('Not logged in')
  }

  try {
    const userInfo = projectId ? await getProjectUser(projectId) : await getCliUser()

    return {
      email: userInfo.email,
      id: userInfo.id,
      name: userInfo.name,
      provider: userInfo.provider,
    }
  } catch (error) {
    return error instanceof Error ? error : new Error('Failed to fetch user info')
  }
}

export async function gatherAuthInfo(includeSecrets: boolean): Promise<AuthInfo> {
  const token = await getCliToken()
  const hasToken = Boolean(token)
  const config = getUserConfig()
  const authType = config.get('authType')

  return {
    authToken: token ? (includeSecrets ? token : '<redacted>') : undefined,
    hasToken,
    userType: typeof authType === 'string' ? authType : 'normal',
  }
}

export async function gatherCliInfo(): Promise<CliInfo> {
  const [version, installation] = await Promise.all([getCliVersion(), detectCliInstallation()])

  const {packageManager, resolvedFrom} = installation.currentExecution

  let installContext: string
  switch (resolvedFrom) {
    case 'global': {
      installContext = packageManager ? `globally (${packageManager})` : 'globally'
      break
    }
    case 'local': {
      installContext = 'locally'
      break
    }
    case 'npx': {
      installContext = 'via npx'
      break
    }
    default: {
      installContext = 'unknown'
    }
  }

  return {installContext, version}
}

export async function gatherProjectInfo(
  projectDirectory: string | undefined,
): Promise<ProjectInfo | undefined> {
  if (!projectDirectory) {
    return undefined
  }

  const [cliConfigName, studioConfigFullPath] = await Promise.all([
    findCliConfigFile(projectDirectory),
    tryFindStudioConfigPath(projectDirectory),
  ])

  return {
    cliConfigPath: cliConfigName,
    rootPath: projectDirectory,
    studioConfigPath: studioConfigFullPath ? path.basename(studioConfigFullPath) : undefined,
  }
}

export async function gatherStudioWorkspaces(projectDirectory: string): Promise<StudioWorkspace[]> {
  const rawConfig = await getStudioConfig(projectDirectory, {resolvePlugins: false})

  if (Array.isArray(rawConfig)) {
    return rawConfig.map((ws) => ({
      dataset: ws.dataset,
      name: ws.name,
      projectId: ws.projectId,
    }))
  }

  return [
    {
      dataset: rawConfig.dataset,
      name: rawConfig.name,
      projectId: rawConfig.projectId,
    },
  ]
}

export async function gatherResolvedWorkspaces(
  projectDirectory: string,
  userId: string | undefined,
): Promise<ResolvedWorkspace[]> {
  const resolvedConfig = await getStudioConfig(projectDirectory, {resolvePlugins: true})

  // Gather unique project IDs for role fetching
  const projectIds = [...new Set(resolvedConfig.map((ws) => ws.projectId))]
  const projectMap = new Map<string, string[]>()

  await Promise.all(
    projectIds.map(async (projectId) => {
      try {
        const project = await getProjectById(projectId)
        if (project && userId) {
          const member = (project.members || []).find((m) => m.id === userId)
          // @ts-expect-error - Incorrect type definition in @sanity/client
          const roles: string[] = member?.roles?.map((r) => r.name) ?? []
          projectMap.set(projectId, roles)
        }
      } catch {
        // Project not accessible, skip roles
      }
    }),
  )

  return resolvedConfig.map((ws) => ({
    name: ws.name,
    roles: projectMap.get(ws.projectId) ?? [],
    title: ws.title,
  }))
}

async function findCliConfigFile(directory: string): Promise<string | undefined> {
  for (const name of ['sanity.cli.ts', 'sanity.cli.js']) {
    try {
      await access(path.join(directory, name))
      return name
    } catch {
      // File doesn't exist, try next
    }
  }
  return undefined
}
