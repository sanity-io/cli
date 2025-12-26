import {randomBytes} from 'node:crypto'
import {copyFile, mkdir, readdir, readFile, stat, symlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {getExamplesPath, getTempPath} from '../utils/paths.js'

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
 * Copies files and directories from an example, creating an isolated test copy.
 *
 * @param exampleName - The name of the example to clone
 * @param customTempDir - Optional custom temp directory
 * @returns The path to the isolated test directory
 * @internal
 */
async function copyExample(exampleName: string, customTempDir?: string): Promise<string> {
  const tempDirectory = getTempPath(customTempDir)

  // Examples are cloned in the tmp directory by the setup function
  let tempExamplePath = join(tempDirectory, `example-${exampleName}`)

  try {
    const stats = await stat(tempExamplePath)
    if (!stats.isDirectory()) {
      throw new Error(`${tempExamplePath} is not a directory`)
    }
  } catch (e) {
    // If the cloned example doesn't exist, copy from the bundled examples
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      tempExamplePath = join(getExamplesPath(), exampleName)
    } else {
      throw e
    }
  }

  const tempId = randomBytes(8).toString('hex')
  const tempPath = join(tempDirectory, `example-${exampleName}-${tempId}`)

  // Always skip node_modules (will be symlinked), dist (tests build if needed), and tmp
  const skipDirs = ['node_modules', 'dist', 'tmp']

  // Copy the example to the temp directory
  await testCopyDirectory(tempExamplePath, tempPath, skipDirs)

  // Symlink the node_modules directory for performance
  await symlink(join(tempExamplePath, 'node_modules'), join(tempPath, 'node_modules'))

  // Replace the package.json name with a temp name
  const packageJsonPath = join(tempPath, 'package.json')
  const packageJson = await readFile(packageJsonPath, 'utf8')
  const packageJsonData = JSON.parse(packageJson)
  packageJsonData.name = `${packageJsonData.name}-${tempId}`
  await writeFile(packageJsonPath, JSON.stringify(packageJsonData, null, 2))

  return tempPath
}

/** Options for testExample */
export interface TestExampleOptions {
  /**
   * Custom temp directory. Defaults to process.cwd()/tmp
   */
  tempDir?: string
}

/**
 * Clones an example directory into a temporary directory with an isolated copy.
 *
 * The function creates a unique temporary copy of the specified example with:
 * - A random unique ID to avoid conflicts between parallel tests
 * - Symlinked node_modules for performance (from the global setup version)
 * - Modified package.json name to prevent conflicts
 *
 * The example is first looked up in the temp directory (if global setup ran),
 * otherwise it falls back to the bundled examples in the package.
 *
 * @param exampleName - The name of the example to clone (e.g., 'basic-app', 'basic-studio')
 * @param options - Configuration options
 * @returns The absolute path to the temporary directory containing the example
 *
 * @example
 * ```typescript
 * import {testExample} from '@sanity/cli-test'
 * import {describe, test} from 'vitest'
 *
 * describe('my test suite', () => {
 *   test('should work with basic-studio', async () => {
 *     const cwd = await testExample('basic-studio')
 *     // ... run your tests in this directory
 *   })
 * })
 * ```
 */
export async function testExample(
  exampleName: string,
  options: TestExampleOptions = {},
): Promise<string> {
  const {tempDir} = options
  const examplesPath = getExamplesPath()
  const examplePath = join(examplesPath, exampleName)

  // Check if the example exists in bundled examples
  try {
    const stats = await stat(examplePath)
    if (!stats.isDirectory()) {
      throw new Error(`Example ${exampleName} is not a directory in ${examplesPath}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Example ${exampleName} does not exist in ${examplesPath}`)
    }
    throw error
  }

  // Copy the example to an isolated temp directory
  const tempPath = await copyExample(exampleName, tempDir)

  return tempPath
}
