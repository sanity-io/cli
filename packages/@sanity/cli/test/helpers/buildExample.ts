import {exec} from 'node:child_process'
import {promisify} from 'node:util'

const execAsync = promisify(exec)

/**
 * Builds a test example by running `npx sanity build --yes` in the example directory.
 *
 * @param cwd - The directory path of the example to build
 * @returns Promise that resolves when the build is complete
 */
export async function buildExample(cwd: string): Promise<void> {
  await execAsync('npx sanity build --yes', {cwd})
}
