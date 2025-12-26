import {exec as execNode} from 'node:child_process'
import {readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'

import ora from 'ora'

import {getExamplesPath, getTempPath} from '../utils/paths.js'
import {testCopyDirectory} from './testExample.js'

const exec = promisify(execNode)

/** Default examples to copy and set up */
export const DEFAULT_EXAMPLES = [
  'basic-app',
  'basic-studio',
  'multi-workspace-studio',
  'worst-case-studio',
] as const

/** Options for setupTestExamples */
export interface SetupTestExamplesOptions {
  /**
   * Examples to set up. Defaults to all 4 bundled examples.
   */
  examples?: string[]

  /**
   * Custom temp directory path. Defaults to process.cwd()/tmp
   */
  tempDir?: string
}

/**
 * Global setup function for initializing test examples.
 *
 * Copies examples from the bundled location to a temp directory
 * and installs dependencies.
 *
 * Note: Examples are NOT built during setup. Tests that need built
 * examples should build them as part of the test.
 *
 * This function is designed to be used with vitest globalSetup.
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
export async function setup(options: SetupTestExamplesOptions = {}): Promise<void> {
  const {examples = DEFAULT_EXAMPLES, tempDir} = options

  const spinner = ora({
    // Without this, the watch mode input is discarded
    discardStdin: false,
    text: 'Initializing test environment...',
  }).start()

  try {
    const examplesDir = getExamplesPath()
    const tempDirectory = getTempPath(tempDir)

    for (const example of examples) {
      const fromPath = join(examplesDir, example)
      const toPath = join(tempDirectory, `example-${example}`)

      // Copy the example, excluding node_modules and dist
      await testCopyDirectory(fromPath, toPath, ['node_modules', 'dist'])

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

/** Options for teardownTestExamples */
export interface TeardownTestExamplesOptions {
  /**
   * Custom temp directory path. Defaults to process.cwd()/tmp
   */
  tempDir?: string
}

/**
 * Teardown function to clean up test examples.
 *
 * Removes the temp directory created by setupTestExamples.
 *
 * This function is designed to be used with vitest globalSetup.
 *
 * @param options - Configuration options
 */
export async function teardown(options: TeardownTestExamplesOptions = {}): Promise<void> {
  const {tempDir} = options
  const tempDirectory = getTempPath(tempDir)

  // Remove the tmp directory
  await rm(tempDirectory, {force: true, recursive: true})
}
