import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout} from 'node:timers/promises'

import {execa} from 'execa'

export async function writeShrinkwrap(manifest, destination, {env} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'sanity-npm-lock-'))
  try {
    const {
      dependencies,
      name,
      optionalDependencies,
      peerDependencies,
      peerDependenciesMeta,
      version,
    } = manifest
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        dependencies,
        name,
        optionalDependencies,
        peerDependencies,
        peerDependenciesMeta,
        version,
      }),
    )
    await execa(
      'npm',
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
      {cwd: directory, env, stdio: 'inherit'},
    )
    await execa('npm', ['shrinkwrap'], {cwd: directory, env, stdio: 'inherit'})
    await copyFile(join(directory, 'npm-shrinkwrap.json'), destination)
  } finally {
    await rm(directory, {force: true, recursive: true})
  }
}

export async function packWorkspacePackage(directory, archive) {
  // pnpm resolves workspace versions and catalog references before packing.
  await execa('pnpm', ['--config.ignore-scripts=true', 'pack', '--out', archive], {cwd: directory})
  const {stdout} = await execa('tar', ['-xOf', archive, 'package/package.json'])
  return JSON.parse(stdout)
}

async function waitForVersion(name, version) {
  const specifier = `${name}@${version}`
  const deadline = Date.now() + 90_000
  for (;;) {
    const result = await execa(
      'npm',
      ['view', specifier, 'version', '--prefer-online', '--fetch-retries=0'],
      {reject: false},
    )
    if (result.exitCode === 0 && result.stdout.trim() === version) return
    if (result.exitCode !== 0 && !/\b(?:E404|ETARGET)\b/.test(result.stderr)) {
      throw new Error(`Could not check npm for ${specifier}. ${result.stderr}`)
    }
    if (Date.now() >= deadline)
      throw new Error(`Publish ${specifier} before generating the shrinkwrap.`)
    await setTimeout(2000)
  }
}

export async function preparePackageShrinkwrap(directory, workspaceDependencies) {
  const staging = await mkdtemp(join(tmpdir(), 'sanity-npm-pack-'))
  const shrinkwrap = join(directory, 'npm-shrinkwrap.json')
  try {
    await rm(shrinkwrap, {force: true})
    const manifest = await packWorkspacePackage(directory, join(staging, 'package.tgz'))
    await Promise.all(
      workspaceDependencies.map(async (name) => {
        const {version} = JSON.parse(
          await readFile(join(directory, 'node_modules', name, 'package.json'), 'utf8'),
        )
        await waitForVersion(name, version)
      }),
    )
    await writeShrinkwrap(manifest, shrinkwrap)
  } finally {
    await rm(staging, {force: true, recursive: true})
  }
}
