import {execSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'

const require = createRequire(import.meta.url)

/**
 * Runs `pnpm pack` on `@sanity/cli` and returns the absolute path to the tarball.
 */
export function packCli(): string {
  const cliPkgJsonPath = require.resolve('@sanity/cli/package.json')
  const cliDir = dirname(cliPkgJsonPath)

  const tarballName = execSync('pnpm pack --pack-destination /tmp', {
    cwd: cliDir,
    encoding: 'utf8',
  }).trim()

  // pnpm pack may output lifecycle script logs before the tarball name.
  // The tarball filename is always the last line of output.
  const lines = tarballName.split('\n')
  const tgzLine = lines.findLast((line) => line.endsWith('.tgz'))

  if (!tgzLine) {
    throw new Error(`No .tgz filename found in pnpm pack output:\n${tarballName}`)
  }

  return tgzLine
}

/**
 * Installs a CLI tarball into a directory and returns
 * the absolute path to the `sanity` binary.
 */
export function installFromTarball(tarballPath: string, installDir: string): string {
  execSync(`npm install --prefix "${installDir}" "${tarballPath}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  })

  const binaryPath = join(installDir, 'node_modules', '.bin', 'sanity')
  if (!existsSync(binaryPath)) {
    throw new Error(`sanity binary not found at ${binaryPath} after installing tarball`)
  }
  return binaryPath
}
