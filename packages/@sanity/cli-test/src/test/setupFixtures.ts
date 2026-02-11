import {exec as execNode} from 'node:child_process'
import {readFile, rm, writeFile} from 'node:fs/promises'
import {basename, join} from 'node:path'
import {promisify} from 'node:util'

import ora from 'ora'
import {glob} from 'tinyglobby'
import {type TestProject} from 'vitest/node'

import {fileExists} from '../utils/fileExists.js'
import {getFixturesPath, getTempPath} from '../utils/paths.js'
import {DEFAULT_FIXTURES} from './constants.js'
import {testCopyDirectory} from './testFixture.js'

const exec = promisify(execNode)

/**
 * Options for setupTestFixtures
 *
 * @public
 */
export interface SetupTestFixturesOptions {
  /**
   * Glob patterns for additional fixture directories to set up.
   *
   * Each pattern is matched against directories in the current working directory.
   * Only directories containing a `package.json` file are included.
   *
   * @example
   * ```typescript
   * ['fixtures/*', 'dev/*']
   * ```
   */
  additionalFixtures?: string[]

  /**
   * Custom temp directory path. Defaults to process.cwd()/tmp
   */
  tempDir?: string
}

async function getAdditionalFixturePaths(fixtures: string[]): Promise<FixtureDetails[]> {
  const paths = await glob(fixtures, {
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
    onlyDirectories: true,
  })

  const additionalFixtures: FixtureDetails[] = []

  for (const path of paths) {
    if (await fileExists(join(`${path}/package.json`))) {
      additionalFixtures.push({
        fixture: basename(path),
        fromPath: path,
        includeDist: false,
      })
    }
  }

  return additionalFixtures
}

interface FixtureDetails {
  fixture: string
  fromPath: string
  includeDist: boolean
}

/**
 * Global setup function for initializing test fixtures.
 *
 * Copies fixtures from the bundled location to a temp directory
 * and installs dependencies.
 *
 * Note: Fixtures are NOT built during setup. Tests that need built
 * fixtures should build them as part of the test.
 *
 * This function is designed to be used with vitest globalSetup.
 *
 * @public
 *
 * @param options - Configuration options
 * @example
 * ```typescript
 * // In vitest.config.ts
 * export default defineConfig({
 *   test: {
 *     globalSetup: ['@sanity/cli-test/vitest']
 *   }
 * })
 * ```
 */
export async function setup(_: TestProject, options: SetupTestFixturesOptions = {}): Promise<void> {
  const {additionalFixtures, tempDir} = options

  const spinner = ora({
    // Without this, the watch mode input is discarded
    discardStdin: false,
    text: 'Initializing test environment...',
  }).start()

  try {
    const fixturesDir = getFixturesPath()
    const tempDirectory = getTempPath(tempDir)

    const allFixturePaths: FixtureDetails[] = []

    // Add the default fixtures
    for (const [fixture, options] of Object.entries(DEFAULT_FIXTURES)) {
      allFixturePaths.push({
        fixture,
        fromPath: join(fixturesDir, fixture),
        includeDist: 'includeDist' in options && options.includeDist ? options.includeDist : false,
      })
    }

    // Add the additional fixtures
    if (additionalFixtures && additionalFixtures.length > 0) {
      const additionalFixturePaths = await getAdditionalFixturePaths(additionalFixtures)

      if (additionalFixturePaths.length > 0) {
        allFixturePaths.push(...additionalFixturePaths)
      } else {
        spinner.warn(
          `No additional fixtures found, check the glob pattern: ${additionalFixtures.join(', ')}`,
        )
      }
    }

    for (const {fixture, fromPath, includeDist} of allFixturePaths) {
      const toPath = join(tempDirectory, `fixture-${fixture}`)
      // Copy the fixture, excluding node_modules and dist
      await testCopyDirectory(fromPath, toPath, ['node_modules', ...(includeDist ? [] : ['dist'])])

      // Replace the package.json name with a temp name
      const packageJsonPath = join(toPath, 'package.json')
      const packageJson = await readFile(packageJsonPath, 'utf8')
      const packageJsonData = JSON.parse(packageJson)
      packageJsonData.name = `${packageJsonData.name}-test`
      await writeFile(packageJsonPath, JSON.stringify(packageJsonData, null, 2))

      // Run pnpm install --no-lockfile in the temp directory
      try {
        await exec(`pnpm install --prefer-offline --no-lockfile`, {
          cwd: toPath,
        })
      } catch (error) {
        const execError = error as {message: string; stderr?: string; stdout?: string}
        spinner.fail('Failed to install dependencies')
        console.error(execError.stderr || execError.stdout || execError.message)
        throw new Error(
          `Error installing dependencies in ${toPath}: ${execError.stderr || execError.stdout || execError.message}`,
        )
      }
    }

    spinner.succeed('Test environment initialized')
  } catch (error) {
    spinner.fail('Failed to initialize test environment')
    throw error
  }
}

/**
 * Options for teardownTestFixtures
 *
 * @public
 */
export interface TeardownTestFixturesOptions {
  /**
   * Custom temp directory path. Defaults to process.cwd()/tmp
   */
  tempDir?: string
}

/**
 * Teardown function to clean up test fixtures.
 *
 * Removes the temp directory created by setupTestFixtures.
 *
 * This function is designed to be used with vitest globalSetup.
 *
 * @public
 *
 * @param options - Configuration options
 */
export async function teardown(options: TeardownTestFixturesOptions = {}): Promise<void> {
  const {tempDir} = options
  const tempDirectory = getTempPath(tempDir)

  // Remove the tmp directory
  await rm(tempDirectory, {force: true, maxRetries: 3, recursive: true}).catch(() => {})
}
