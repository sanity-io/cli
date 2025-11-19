import {findProjectRoot, Output} from '@sanity/cli-core'

export async function getMigrationRootDirectory(output: Output): Promise<string> {
  try {
    const projectRoot = await findProjectRoot(process.cwd())
    return projectRoot.directory
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not find Sanity project root'
    output.error(message, {exit: 1})
  }
}
