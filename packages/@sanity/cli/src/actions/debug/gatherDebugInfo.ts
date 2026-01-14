import {type CliConfig, getCliToken, getUserConfig, type ProjectRootResult} from '@sanity/cli-core'

import {getProjectById} from '../../services/projects.js'
import {getCliUser, getProjectUser} from '../../services/user.js'
import {findSanityModulesVersions} from '../versions/findSanityModulesVersions.js'
import {type ModuleVersionResult} from '../versions/types.js'
import {
  type AuthInfo,
  type DebugInfo,
  type DebugInfoOptions,
  type ProjectInfo,
  type UserInfo,
} from './types.js'

export async function gatherDebugInfo(options: DebugInfoOptions): Promise<DebugInfo> {
  const {cliConfig, includeSecrets, projectRoot} = options

  // Gather all info in parallel where possible
  const [auth, globalConfig, projectConfigResult, versions] = await Promise.all([
    gatherAuthInfo(includeSecrets),
    gatherGlobalConfig(),
    gatherProjectConfig(cliConfig),
    gatherVersionsInfo(projectRoot),
  ])

  // Gather user and project info that depend on auth
  const user = await gatherUserInfo(projectConfigResult, auth.hasToken)
  const project = await gatherProjectInfo(projectConfigResult, auth.hasToken, user)

  return {
    auth,
    globalConfig,
    project,
    projectConfig: projectConfigResult,
    user,
    versions,
  }
}

async function gatherAuthInfo(includeSecrets: boolean): Promise<AuthInfo> {
  const token = await getCliToken()
  const hasToken = Boolean(token)

  return {
    authToken: includeSecrets && token ? token : '<redacted>',
    hasToken,
    userType: 'normal',
  }
}

function gatherGlobalConfig(): Record<string, unknown> {
  return getUserConfig().all
}

async function gatherProjectConfig(cliConfig: CliConfig): Promise<CliConfig | Error> {
  try {
    const config = cliConfig

    if (!config.api?.projectId) {
      return new Error('Missing required "api.projectId" key')
    }

    return config
  } catch (error) {
    return error instanceof Error ? error : new Error('Failed to load project config')
  }
}

async function gatherVersionsInfo(projectRoot: ProjectRootResult): Promise<ModuleVersionResult[]> {
  try {
    return await findSanityModulesVersions({cwd: projectRoot.directory})
  } catch {
    return []
  }
}

async function gatherUserInfo(
  projectConfig: CliConfig | Error,
  hasToken: boolean,
): Promise<Error | UserInfo | null> {
  if (!hasToken) {
    return new Error('Not logged in')
  }

  try {
    /**
     * If the project config has a project ID, get the user for the project
     * Otherwise, get the user for the global client
     */
    const userInfo =
      projectConfig instanceof Error || !projectConfig.api?.projectId
        ? await getCliUser()
        : await getProjectUser(projectConfig.api.projectId)

    return {
      email: userInfo.email,
      id: userInfo.id,
      name: userInfo.name,
    }
  } catch (error) {
    return error instanceof Error ? error : new Error('Failed to fetch user info')
  }
}

async function gatherProjectInfo(
  projectConfig: CliConfig | Error,
  hasToken: boolean,
  user: Error | UserInfo | null,
): Promise<Error | ProjectInfo | null> {
  if (!hasToken || projectConfig instanceof Error) {
    return null
  }

  const projectId = projectConfig.api?.projectId
  if (!projectId) {
    return null
  }

  try {
    const projectInfo = await getProjectById(projectId)

    if (!projectInfo) {
      return new Error(`Project specified in configuration (${projectId}) does not exist in API`)
    }

    const userId = user instanceof Error || !user ? null : user.id
    const member = (projectInfo.members || []).find((member) => member.id === userId)

    return {
      displayName: projectInfo.displayName,
      id: projectId,
      // @ts-expect-error - Incorrect type definition in @sanity/client
      userRoles: member && member.roles ? member.roles.map((role) => role.name) : ['<none>'],
    }
  } catch (error) {
    return error instanceof Error ? error : new Error('Failed to fetch project info')
  }
}
