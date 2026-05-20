import {randomBytes} from 'node:crypto'
import {copyFile, mkdir, readdir, readFile, stat, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {getFixturesPath, getTempPath} from '../utils/paths.js'
import {DEFAULT_FIXTURES, type FixtureName} from './constants.js'

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
   * Custom temp directory. Defaults to process.cwd()/tmp (or the OS temp directory when
   * `useSystemTmp` is true).
   */
  tempDir?: string
  /**
   * Use the OS temp directory instead of cwd/tmp. Avoids monorepo workspace detection by
   * package managers and git when tests run inside a monorepo. Ignored when `tempDir` is set.
   */
  useSystemTmp?: boolean
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
  const {tempDir, useSystemTmp = false} = options
  const {includeDist = false} =
    fixtureName in DEFAULT_FIXTURES ? DEFAULT_FIXTURES[fixtureName as FixtureName] : {}

  // Source is always looked up in the default temp path (cwd/tmp) where global setup
  // pre-clones fixtures and installs their node_modules. The destination can be redirected
  // to system tmp to keep the working copy out of the monorepo (avoids pnpm treating it as
  // a workspace importer and mutating pnpm-lock.yaml).
  const sourceTempDir = getTempPath(tempDir)
  const destTempDir = tempDir
    ? sourceTempDir
    : useSystemTmp
      ? join(tmpdir(), 'sanity-cli-e2e')
      : sourceTempDir
  await mkdir(destTempDir, {recursive: true})

  // Fixtures are cloned in the source tmp directory by the setup function
  let tempFixturePath = join(sourceTempDir, `fixture-${fixtureName}`)

  try {
    const stats = await stat(tempFixturePath)
    if (!stats.isDirectory()) {
      throw new Error(`${tempFixturePath} is not a directory`)
    }
  } catch (err: unknown) {
    // If the cloned fixture doesn't exist, copy from the bundled fixtures
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      tempFixturePath = join(getFixturesPath(), fixtureName)
    } else {
      throw err
    }
  }

  const tempId = randomBytes(8).toString('hex')
  const tempPath = join(destTempDir, `fixture-${fixtureName}-${tempId}`)

  // Always skip node_modules (will be symlinked), tmp and (unless specifically included) dist
  const skipDirs = ['node_modules', 'tmp', ...(includeDist ? [] : ['dist'])]

  // Copy the fixture to the temp directory
  await testCopyDirectory(tempFixturePath, tempPath, skipDirs)

  // Mirror node_modules as a directory of per-entry symlinks (instead of a
  // single symlink to the source). This preserves the perf benefit of not
  // copying installed deps, while letting us shadow specific subpaths per
  // fixture. `.sanity` is excluded so each fixture instance gets its own
  // Vite dep cache — sharing the cache across parallel tests causes
  // dependency-optimization races ("Cannot read properties of undefined
  // (reading 'imports')").
  // If the source has no node_modules yet (test will install fresh), skip
  // the mirroring entirely.
  const srcNodeModules = join(tempFixturePath, 'node_modules')
  const destNodeModules = join(tempPath, 'node_modules')
  let srcEntries
  try {
    srcEntries = await readdir(srcNodeModules, {withFileTypes: true})
  } catch (err) {
    if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) throw err
  }
  if (srcEntries) {
    await mkdir(destNodeModules, {recursive: true})
    for (const entry of srcEntries) {
      if (entry.name === '.sanity') continue
      await symlink(
        join(srcNodeModules, entry.name),
        join(destNodeModules, entry.name),
        entry.isDirectory() ? 'dir' : 'file',
      )
    }
  }

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
