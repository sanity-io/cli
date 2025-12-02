import {
  findStudioConfigPath,
  getEmptyAuth,
  mockBrowserEnvironment,
  tryGetDefaultExport,
} from '@sanity/cli-core'
import {getTsconfig} from 'get-tsconfig'
import {firstValueFrom, of} from 'rxjs'
import {resolveConfig} from 'sanity'
import {tsImport} from 'tsx/esm/api'

export async function importStudioConfig(rootPath: string) {
  const mockBrowserCleanup = await mockBrowserEnvironment(rootPath)

  try {
    const tsconfig = getTsconfig(rootPath)
    const configPath = await findStudioConfigPath(rootPath)

    if (!configPath) {
      throw new Error(`Failed to find config in "${rootPath}"`)
    }

    let config = await tsImport(configPath, {
      parentURL: import.meta.url,
      tsconfig: tsconfig?.path ?? undefined,
    })

    config = tryGetDefaultExport(config)

    if (!config) {
      throw new Error('Invalid CLI config structure')
    }

    let workspaces = Array.isArray(config)
      ? config
      : [{...config, basePath: config.basePath || '/', name: config.name || 'default'}]

    workspaces = workspaces.map((workspace) => ({
      ...workspace,
      auth: {state: of(getEmptyAuth())},
    }))

    return await firstValueFrom(resolveConfig(workspaces))
  } catch (err) {
    throw new Error(`Failed to import config: ${err.message}`)
  } finally {
    mockBrowserCleanup()
  }
}
