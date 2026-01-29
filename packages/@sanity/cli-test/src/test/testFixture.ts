import {randomBytes} from 'node:crypto'
import {copyFile, mkdir, readdir, readFile, stat, symlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {getFixturesPath, getTempPath} from '../utils/paths.js'
import {type FixtureName} from './constants.js'

/**
 * @deprecated Use {@link TestFixtureOptions} instead. This type alias will be removed in a future release.
 * @public
 */
export type TestExampleOptions = TestFixtureOptions

/**
 * Recursively copy a directory, skipping specified folders.
 *
 * @param srcDir - Source directory to copy from
 * @param destDir - Destination directory to copy to
 * @param skip - Array of directory/file names to skip (e.g., ['node_modules', 'dist'])
 * @internal
 */
export async function testCopyDirectory(
  srcDir: string,
  destDir: string,
  skip: string[] = [],
): Promise<void> {
  await mkdir(destDir, {recursive: true})

  const entries = await readdir(srcDir)

  for (const entry of entries) {
    if (skip.includes(entry)) {
      continue
    }

    const srcPath = join(srcDir, entry)
    const destPath = join(destDir, entry)

    const stats = await stat(srcPath)

    await (stats.isDirectory()
      ? testCopyDirectory(srcPath, destPath, skip)
      : copyFile(srcPath, destPath))
  }
}

/**
 * @public
 */
export interface TestFixtureOptions {
  /**
   * Custom temp directory. Defaults to process.cwd()/tmp
   */
  tempDir?: string
}

/**
 * Clones a fixture directory into a temporary directory with an isolated copy.
 *
 * The function creates a unique temporary copy of the specified fixture with:
 * - A random unique ID to avoid conflicts between parallel tests
 * - Symlinked node_modules for performance (from the global setup version)
 * - Modified package.json name to prevent conflicts
 *
 * The fixture is first looked up in the temp directory (if global setup ran),
 * otherwise it falls back to the bundled fixtures in the package.
 *
 * @param fixtureName - The name of the fixture to clone (e.g., 'basic-app', 'basic-studio')
 * @param options - Configuration options
 * @returns The absolute path to the temporary directory containing the fixture
 *
 * @public
 *
 * @example
 * ```typescript
 * import {testFixture} from '@sanity/cli-test'
 * import {describe, test} from 'vitest'
 *
 * describe('my test suite', () => {
 *   test('should work with basic-studio', async () => {
 *     const cwd = await testFixture('basic-studio')
 *     // ... run your tests in this directory
 *   })
 * })
 * ```
 */
export async function testFixture(
  fixtureName: FixtureName | (string & {}),
  options: TestFixtureOptions = {},
): Promise<string> {
  const {tempDir} = options

  const tempDirectory = getTempPath(tempDir)

  // Fixtures are cloned in the tmp directory by the setup function
  let tempFixturePath = join(tempDirectory, `fixture-${fixtureName}`)

  try {
    const stats = await stat(tempFixturePath)
    if (!stats.isDirectory()) {
      throw new Error(`${tempFixturePath} is not a directory`)
    }
  } catch (e) {
    // If the cloned fixture doesn't exist, copy from the bundled fixtures
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      tempFixturePath = join(getFixturesPath(), fixtureName)
    } else {
      throw e
    }
  }

  const tempId = randomBytes(8).toString('hex')
  const tempPath = join(tempDirectory, `fixture-${fixtureName}-${tempId}`)

  // Always skip node_modules (will be symlinked), dist (tests build if needed), and tmp
  const skipDirs = ['node_modules', 'dist', 'tmp']

  // Copy the fixture to the temp directory
  await testCopyDirectory(tempFixturePath, tempPath, skipDirs)

  // Symlink the node_modules directory for performance
  await symlink(join(tempFixturePath, 'node_modules'), join(tempPath, 'node_modules'))

  // Replace the package.json name with a temp name
  const packageJsonPath = join(tempPath, 'package.json')
  const packageJson = await readFile(packageJsonPath, 'utf8')
  const packageJsonData = JSON.parse(packageJson)
  packageJsonData.name = `${packageJsonData.name}-${tempId}`
  await writeFile(packageJsonPath, JSON.stringify(packageJsonData, null, 2))

  return tempPath
}

/**
 * @deprecated Use {@link testFixture} instead. This function will be removed in a future release.
 *
 * Clones an example (now called fixture) directory into a temporary directory with an isolated copy.
 *
 * @param exampleName - The name of the example/fixture to clone (e.g., 'basic-app', 'basic-studio')
 * @param options - Configuration options
 * @returns The absolute path to the temporary directory containing the example/fixture
 *
 * @public
 */
export async function testExample(
  exampleName: FixtureName | (string & {}),
  options: TestFixtureOptions = {},
): Promise<string> {
  return testFixture(exampleName, options)
}
