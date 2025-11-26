import {findProjectRoot, getCliConfig} from '@sanity/cli-core'
import {createClient, type SanityClient} from '@sanity/client'

export interface CliClientOptions {
  apiVersion?: string

  cwd?: string
  dataset?: string
  projectId?: string
  token?: string
  useCdn?: boolean
}

export async function getCliClient(options: CliClientOptions = {}): Promise<SanityClient> {
  if (typeof process !== 'object') {
    throw new TypeError('getCliClient() should only be called from node.js scripts')
  }

  const {
    apiVersion = '2022-06-06',
    cwd = process.env.SANITY_BASE_PATH || process.cwd(),
    dataset,
    projectId,
    token = getCliClient.__internal__getToken(),
    useCdn = false,
  } = options

  if (projectId && dataset) {
    return createClient({apiVersion, dataset, projectId, token, useCdn})
  }

  const projectRoot = await findProjectRoot(cwd)
  const cliConfig = await getCliConfig(projectRoot.directory)

  if (!cliConfig) {
    throw new Error('Unable to resolve CLI configuration')
  }

  const apiConfig = cliConfig.api || {}
  if (!apiConfig.projectId || !apiConfig.dataset) {
    throw new Error('Unable to resolve project ID/dataset from CLI configuration')
  }

  return createClient({
    apiVersion,
    dataset: apiConfig.dataset,
    projectId: apiConfig.projectId,
    token,
    useCdn,
  })
}

/**
 * @internal
 * @deprecated This is only for INTERNAL use, and should not be relied upon outside of official Sanity modules
 * @returns A token to use when constructing a client without a `token` explicitly defined, or undefined
 */
getCliClient.__internal__getToken = (): string | undefined => undefined
