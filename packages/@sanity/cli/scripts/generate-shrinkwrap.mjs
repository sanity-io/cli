import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'

import {execa} from 'execa'

const cliRoot = fileURLToPath(new URL('../', import.meta.url))
const shrinkwrapPath = join(cliRoot, 'npm-shrinkwrap.json')

async function waitForCliCore(version) {
  const packageVersion = `@sanity/cli-core@${version}`
  const deadline = Date.now() + 90_000

  for (;;) {
    const result = await execa(
      'npm',
      ['view', packageVersion, 'version', '--prefer-online', '--fetch-retries=0'],
      {reject: false},
    )
    if (result.exitCode === 0 && result.stdout.trim() === version) return

    if (result.exitCode !== 0 && !/\b(?:E404|ETARGET)\b/.test(result.stderr)) {
      throw new Error(`Could not check npm for ${packageVersion}. ${result.stderr}`)
    }
    if (Date.now() >= deadline) {
      throw new Error(`Publish ${packageVersion} before publishing @sanity/cli.`)
    }
    await setTimeout(2000)
  }
}

await rm(shrinkwrapPath, {force: true})
const staging = await mkdtemp(join(tmpdir(), 'sanity-cli-shrinkwrap-'))
try {
  const archive = join(staging, 'cli.tgz')
  // pnpm expands catalog and workspace ranges in the manifest it packs.
  await execa('pnpm', ['--config.ignore-scripts=true', 'pack', '--out', archive], {cwd: cliRoot})
  const {stdout} = await execa('tar', ['-xOf', archive, 'package/package.json'])
  const {
    dependencies,
    name,
    optionalDependencies,
    peerDependencies,
    peerDependenciesMeta,
    version,
  } = JSON.parse(stdout)
  const core = JSON.parse(
    await readFile(
      new URL('../node_modules/@sanity/cli-core/package.json', import.meta.url),
      'utf8',
    ),
  )

  await waitForCliCore(core.version)
  await writeFile(
    join(staging, 'package.json'),
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
    {cwd: staging, stdio: 'inherit'},
  )
  await execa('npm', ['shrinkwrap'], {cwd: staging, stdio: 'inherit'})
  await copyFile(join(staging, 'npm-shrinkwrap.json'), shrinkwrapPath)
} finally {
  await rm(staging, {force: true, recursive: true})
}
