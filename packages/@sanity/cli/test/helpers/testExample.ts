import {randomBytes} from 'node:crypto'
import {copyFile, mkdir, readdir, readFile, stat, symlink, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

/**
 * Recursively copy a directory, skipping specified folders
 *
 * @internal
 * @hidden
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

    await (stats.isDirectory() ? testCopyDirectory(srcPath, destPath) : copyFile(srcPath, destPath))
  }
}

/**
 * Copies files and directories from the example directory.
 *
 * Note: Copies the node_modules as symlink and rest of the files as regular files.
 *
 *
 * @param exampleName - The name of the example to clone
 * @returns The path to the temporary directory
 *
 * @hidden
 * @internal
 */
async function copyExample(exampleName: string, shouldBuild: boolean) {
  // Examples are cloned in the tmp directory by the setup function
  const tempExamplePath = join(rootDir, 'tmp', `example-${exampleName}`)

  const tempId = randomBytes(8).toString('hex')
  const tempPath = join(rootDir, 'tmp', `example-${exampleName}-${tempId}`)

  let skipDirs = ['node_modules', 'dist']
  if (shouldBuild) {
    // If we are building, we need the dist directory to be present
    skipDirs = ['node_modules']
  }

  // Copy the example to the temp directory
  await testCopyDirectory(tempExamplePath, tempPath, skipDirs)

  // Symlink the node_modules directory
  await symlink(join(tempExamplePath, 'node_modules'), join(tempPath, 'node_modules'))

  // Replace the package.json name with a temp name
  const packageJsonPath = join(tempPath, 'package.json')
  const packageJson = await readFile(packageJsonPath, 'utf8')
  const packageJsonData = JSON.parse(packageJson)
  packageJsonData.name = `${packageJsonData.name}-${tempId}`
  await writeFile(packageJsonPath, JSON.stringify(packageJsonData, null, 2))

  return tempPath
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '../../../../../')
const examplesDir = resolve(rootDir, 'examples')

interface TestExampleOptions {
  /**
   * Whether to build the example before running tests.
   *
   * Defaults to false.
   */
  shouldBuild?: boolean
}

/**
 * Clones an example directory into a temporary directory at the repo root.
 *
 * Note: Tracks which examples have been cloned to avoid cloning the same example multiple times.
 *
 * @param exampleName - The name of the example to clone
 * @param options - The options for the example
 * @returns The path to the temporary directory
 */
export async function testExample(
  exampleName: string,
  options: TestExampleOptions = {},
): Promise<string> {
  const {shouldBuild = false} = options
  const examplePath = join(examplesDir, exampleName)

  // Check if the example exists
  if (!(await stat(examplePath)).isDirectory()) {
    throw new Error(`Example ${exampleName} does not exist in ${examplesDir}`)
  }

  // Copy the example to the temp directory
  const tempPath = await copyExample(exampleName, shouldBuild)

  return tempPath
}
