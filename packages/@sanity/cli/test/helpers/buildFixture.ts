import {exec} from 'node:child_process'
import {promisify} from 'node:util'

const execAsync = promisify(exec)

/**
 * Builds a test fixture by running `npx sanity build --yes` in the fixture directory.
 *
 * @param cwd - The directory path of the fixture to build
 * @returns Promise that resolves when the build is complete
 */
export async function buildFixture(cwd: string): Promise<void> {
  await execAsync('npx sanity build --yes', {cwd})
}
