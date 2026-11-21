import {access, mkdir, mkdtemp, rename, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

import {execa} from 'execa'

import {getSanityDataDir} from './util/getSanityConfigDir.js'

const pendingInstalls = new Map<string, Promise<string>>()

interface InstallDeferredPackageOptions {
  cacheDir?: string
  registry?: string
}

/**
 * Install an exact feature version into its own npm project. The caller can
 * resolve the installed package from the returned directory.
 *
 * @internal
 */
export async function installDeferredPackage(
  name: string,
  version: string,
  options: InstallDeferredPackageOptions = {},
): Promise<string> {
  const cacheDir = options.cacheDir ?? join(getSanityDataDir(), 'cli-dependencies')
  const target = join(cacheDir, process.platform, process.arch, name, version)
  const pending = pendingInstalls.get(target)
  if (pending) return pending
  const install = installPackage(name, version, cacheDir, target, options.registry)
  pendingInstalls.set(target, install)
  try {
    return await install
  } finally {
    pendingInstalls.delete(target)
  }
}

async function installPackage(
  name: string,
  version: string,
  cacheDir: string,
  target: string,
  registry?: string,
): Promise<string> {
  const packageManifest = join('node_modules', name, 'package.json')
  if (await isInstalled(target, packageManifest)) return target

  await mkdir(cacheDir, {recursive: true})
  const staging = await mkdtemp(join(cacheDir, '.install-'))
  try {
    await writeFile(join(staging, 'package.json'), JSON.stringify({private: true}))
    const args = ['install', '--save-exact', '--no-audit', '--no-fund', '--prefer-offline']
    if (registry) args.push('--registry', registry)
    await execa('npm', [...args, `${name}@${version}`], {cwd: staging})

    await mkdir(dirname(target), {recursive: true})
    try {
      await rename(staging, target)
    } catch (error) {
      if (!(await isInstalled(target, packageManifest))) throw error
    }

    return target
  } finally {
    await rm(staging, {force: true, recursive: true})
  }
}

async function isInstalled(directory: string, manifest: string): Promise<boolean> {
  try {
    await access(join(directory, manifest))
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
