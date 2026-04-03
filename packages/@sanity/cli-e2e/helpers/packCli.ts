import {execSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'

const require = createRequire(import.meta.url)

/**
 * Runs `pnpm pack` on the given package and returns the absolute path to the tarball.
 */
export function packPackage(packageName: string): string {
  const pkgJsonPath = require.resolve(`${packageName}/package.json`)
  const pkgDir = dirname(pkgJsonPath)

  const output = execSync('pnpm pack --pack-destination /tmp', {
    cwd: pkgDir,
    encoding: 'utf8',
  }).trim()

  // pnpm pack may output lifecycle script logs before the tarball name.
  // The tarball filename is always the last line of output.
  const lines = output.split('\n')
  const tgzLine = lines.findLast((line) => line.endsWith('.tgz'))

  if (!tgzLine) {
    throw new Error(`No .tgz filename found in pnpm pack output:\n${output}`)
  }

  return tgzLine
}

/**
 * Runs `pnpm pack` on `@sanity/cli` and returns the absolute path to the tarball.
 */
export function packCli(): string {
  return packPackage('@sanity/cli')
}

/**
 * Installs one or more tarballs into a directory and returns
 * the absolute path to the specified binary.
 */
export function installFromTarball(
  tarballPaths: string | string[],
  installDir: string,
  binaryName: string = 'sanity',
): string {
  const paths = Array.isArray(tarballPaths) ? tarballPaths : [tarballPaths]
  const quoted = paths.map((p) => `"${p}"`).join(' ')

  execSync(`npm install --prefix "${installDir}" ${quoted}`, {
    encoding: 'utf8',
    stdio: 'pipe',
  })

  const binaryPath = join(installDir, 'node_modules', '.bin', binaryName)
  if (!existsSync(binaryPath)) {
    throw new Error(`${binaryName} binary not found at ${binaryPath} after installing tarball`)
  }
  return binaryPath
}
