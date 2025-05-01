import {findProjectRoot} from './findProjectRoot.js'

export interface GetProjectConfigOptions {
  /**
   * The current working directory to start looking for project from
   */
  cwd: string

  resolvePlugins?: boolean
}

export async function getProjectConfig(options: GetProjectConfigOptions): Promise<null> {
  const {cwd} = options
  const config = await findProjectRoot(cwd)
  if (!config) {
    throw new Error(`Unable to find project configuration file in/from ${cwd}`)
  }

  return null
}
