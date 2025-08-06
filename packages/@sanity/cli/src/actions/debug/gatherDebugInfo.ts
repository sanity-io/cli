import  {type CliConfig,getCliToken, getConfig as getCliUserConfig, type ProjectRootResult} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

import {findSanityModulesVersions} from '../versions/findSanityModulesVersions.js'
import {type ModuleVersionResult} from '../versions/types.js'

interface DebugInfoOptions {
  cliConfig: CliConfig
  client: SanityClient
  includeSecrets: boolean
  projectRoot: ProjectRootResult
}

interface UserInfo {
  email: string
  id: string
  name: string
}

interface ProjectInfo {
  displayName: string
  id: string
  userRoles: string[]

  studioHostname?: string | null
}

interface AuthInfo {
  authToken: string
  hasToken: boolean
  userType: string
}

interface GlobalConfig {
  [key: string]: any

  authToken?: string
  telemetryConsent?: {
    updatedAt?: number
    value: {
      status: string
      type: string
    }
  }
}

interface DebugInfo {
  auth: AuthInfo
  globalConfig: GlobalConfig
  project: Error | ProjectInfo | null
  projectConfig: CliConfig | Error
  user: Error | UserInfo | null
  versions: ModuleVersionResult[]
}

export async function gatherDebugInfo(options: DebugInfoOptions): Promise<DebugInfo> {
  const {cliConfig, client, includeSecrets, projectRoot} = options

  // Gather all info in parallel where possible
  const [auth, globalConfig, projectConfigResult, versions] = await Promise.all([
    gatherAuthInfo(includeSecrets),
    gatherGlobalConfig(),
    gatherProjectConfig(cliConfig),
    gatherVersionsInfo(projectRoot),
  ])

  // Gather user and project info that depend on auth
  const user = await gatherUserInfo(client, auth.hasToken)
  const project = await gatherProjectInfo(client, projectConfigResult, auth.hasToken, user)

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

async function gatherGlobalConfig(): Promise<GlobalConfig> {
  try {
    const [authToken, telemetryConsent] = await Promise.all([
      getCliUserConfig('authToken'),
      getCliUserConfig('telemetryConsent'),
    ])

    return {
      authToken,
      telemetryConsent,
    }
  } catch {
    return {}
  }
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
  client: SanityClient,
  hasToken: boolean,
): Promise<Error | UserInfo | null> {
  if (!hasToken) {
    return new Error('Not logged in')
  }

  try {
    const userInfo = await client.users.getById('me')
    if (!userInfo) {
      return new Error('Token expired or invalid')
    }

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
  client: SanityClient,
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
    const projectInfo = await client.request<any>({
      url: `/projects/${projectId}`,
    })

    if (!projectInfo) {
      return new Error(`Project specified in configuration (${projectId}) does not exist in API`)
    }

    const userId = user instanceof Error || !user ? null : user.id
    const host = projectInfo.studioHost
    const member = (projectInfo.members || []).find((member: any) => member.id === userId)
    const hostname = host && `https://${host}.sanity.studio/`

    return {
      displayName: projectInfo.displayName,
      id: projectId,
      studioHostname: hostname,
      userRoles: member && member.roles ? member.roles.map((role: any) => role.name) : ['<none>'],
    }
  } catch (error) {
    return error instanceof Error ? error : new Error('Failed to fetch project info')
  }
}
