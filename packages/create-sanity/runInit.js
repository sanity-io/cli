import {spawn} from 'node:child_process'
import {access, mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const cliManifest = join('node_modules', '@sanity', 'cli', 'package.json')

export async function runInit(args) {
  const pin = await readFile(new URL('dist/studio-cli-version.json', import.meta.url), 'utf8')
  const {version} = JSON.parse(pin)
  const local = await resolveLocalCli(version)
  const manifestPath = local ?? (await installCli(version))
  const {bin} = JSON.parse(await readFile(manifestPath, 'utf8'))
  return waitForExit(
    spawn(
      process.execPath,
      [join(dirname(manifestPath), bin.sanity), 'init', ...args, '--from-create'],
      {
        stdio: 'inherit',
      },
    ),
  )
}

async function resolveLocalCli(version) {
  let manifestPath
  try {
    manifestPath = fileURLToPath(import.meta.resolve('@sanity/cli/package.json'))
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return
    throw error
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  return manifest.version === version ? manifestPath : undefined
}

async function installCli(version) {
  const dataDir = process.env.SANITY_INTERNAL_ENV === 'staging' ? '.sanity-staging' : '.sanity'
  const cache = join(process.env.XDG_CACHE_HOME || homedir(), dataDir, 'cli-dependencies')
  const target = join(cache, process.platform, process.arch, '@sanity', 'cli', version)
  const targetManifest = join(target, cliManifest)
  if (await exists(targetManifest)) return targetManifest

  process.stderr.write('Installing the Sanity CLI\n')
  await mkdir(cache, {recursive: true})
  const staging = await mkdtemp(join(cache, '.install-'))
  try {
    await writeFile(join(staging, 'package.json'), '{"private":true}')
    const {code} = await waitForExit(
      spawn(
        'npm',
        [
          'install',
          '--save-exact',
          '--no-audit',
          '--no-fund',
          '--loglevel=error',
          // A newly published CLI pin can be missing from npm's cached metadata.
          '--prefer-online',
          '--no-prefer-offline',
          `@sanity/cli@${version}`,
        ],
        {
          cwd: staging,
          shell: process.platform === 'win32',
          stdio: ['ignore', 'ignore', 'inherit'],
        },
      ),
    )
    if (code !== 0) {
      throw new Error(
        `Could not install @sanity/cli@${version}. Check the npm error above and try again.`,
      )
    }
    await mkdir(dirname(target), {recursive: true})
    try {
      await rename(staging, target)
    } catch (error) {
      if (!(await exists(targetManifest))) throw error
    }
    return targetManifest
  } finally {
    await rm(staging, {force: true, recursive: true})
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({code, signal}))
  })
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}
