import {findProjectRootSync, getCliConfigSync} from '@sanity/cli-core'
import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'

/**
 * @public
 */
export interface CliClientOptions extends ClientConfig {
  /**
   * If no `projectId` or `dataset` is provided, `getCliClient` will try to
   * resolve these from the `sanity.cli.ts` configuration file. Use this option
   * to specify the directory to look for this file.
   */
  cwd?: string
}

/**
 * @public
 *
 * @param options - The options to use for the client.
 * @returns A configured Sanity API client.
 */
export const getCliClient: CliClientGetter = (options: CliClientOptions = {}): SanityClient => {
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

  const projectRoot = findProjectRootSync(cwd)
  const cliConfig = getCliConfigSync(projectRoot.directory)

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

type CliClientGetter = ((options?: CliClientOptions) => SanityClient) & {
  /**
   * @deprecated This is only for INTERNAL use, and should not be relied upon outside of official Sanity modules
   * @returns A token to use when constructing a client without a `token` explicitly defined, or undefined
   * @internal
   */
  __internal__getToken: () => string | undefined
}

getCliClient.__internal__getToken = (): string | undefined => undefined
