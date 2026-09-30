import {existsSync} from 'node:fs'
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

import {execa} from 'execa'

import {bundlePackage} from './package-bundle.js'
import {pruneDeclarations} from './package-declarations.js'
import {type Manifest, prepareDependencies, type ToolchainPackage} from './package-dependencies.js'
import {findBundleEntries} from './package-entries.js'
import {consolidateLicenses} from './package-licenses.js'
import {prepareToolchain} from './package-toolchain.js'
import {prepareTypeDependencies} from './package-types.js'
import {prepareWorkflowHooks} from './package-workflow-hooks.js'

const sourceDir = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const output = join(sourceDir, 'packaged')
const scratch = await mkdtemp(join(tmpdir(), 'sanity-cli-package-'))
const stage = join(scratch, 'deploy')
const source: Manifest = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8'))

try {
  await execa(
    'pnpm',
    [
      '--filter',
      '@sanity/cli',
      'deploy',
      '--prod',
      '--node-linker=hoisted',
      '--ignore-scripts',
      '--frozen-store',
      '--trust-lockfile',
      stage,
    ],
    {cwd: repoRoot},
  )
  await rm(output, {force: true, recursive: true})
  await mkdir(output, {recursive: true})
  for (const name of [
    'bin',
    'codemods',
    'dist',
    'templates',
    'oclif.config.js',
    'oclif.manifest.json',
    'README.md',
    'LICENSE',
  ]) {
    const path = join(sourceDir, name)
    if (existsSync(path)) {
      await cp(path, join(output, name), {
        dereference: true,
        filter: (file) => !file.endsWith('.map'),
        recursive: true,
      })
    }
  }
  const toolchains = new Map<string, ToolchainPackage>()
  const external = await prepareDependencies(stage, output, source.dependencies ?? {}, toolchains)
  await prepareToolchain(stage, output, toolchains)
  // These tools provide types in the public CliConfig/loadEnv API. Other
  // deferred SDKs are private implementation details loaded with their cache.
  await prepareTypeDependencies(
    stage,
    output,
    [...toolchains]
      .filter(([, pkg]) => ['lightningcss', 'rolldown', 'vite'].includes(pkg.name))
      .map(([path]) => path),
  )
  await prepareWorkflowHooks(output)

  const manifest: Manifest = {
    ...source,
    ...external,
    publishConfig: {access: 'public'},
  }
  delete manifest.scripts
  delete manifest.devDependencies
  await writeFile(join(output, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const plugins = ['@oclif/plugin-help', '@sanity/runtime-cli', '@sanity/workflow-cli']
  await writeFile(
    join(output, 'dist/package.json'),
    `${JSON.stringify(
      {
        dependencies: Object.fromEntries(
          plugins.map((name) => [name, source.dependencies?.[name]]),
        ),
        type: 'module',
      },
      null,
      2,
    )}\n`,
  )
  await mkdir(join(output, 'dist/entry'), {recursive: true})
  const bin = await readFile(join(output, 'bin/run.js'), 'utf8')
  await writeFile(
    join(output, 'dist/entry/run.js'),
    bin
      .replace("'../dist/util/pluginAdditions.js'", "'../util/pluginAdditions.js'")
      .replace(
        'fileURLToPath(import.meta.url)',
        "fileURLToPath(new URL('../../bin/run.js', import.meta.url))",
      ),
  )
  await writeFile(
    join(output, 'bin/run.js'),
    "#!/usr/bin/env node\nimport '../dist/entry/run.js'\n",
    {mode: 0o755},
  )

  const {dynamic, manifestReaders, unresolved} = await bundlePackage(output, {
    entries: await findBundleEntries(output),
    external: [
      'sanity',
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ],
    // Command tools are loaded from their cache through adapters in place.
    preserve: [...toolchains.keys()].map((path) => join('dist', relative(stage, path))),
  })
  if (dynamic.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Packages kept unbundled for runtime module loading:\n  ${dynamic.join('\n  ')}`)
  }
  if (unresolved.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Optional modules left to runtime resolution:\n  ${unresolved.join('\n  ')}`)
  }
  await pruneDeclarations(
    output,
    ['index', '_internal', 'runtime', 'invokeSanityCli/index'].map(
      (name) => `dist/exports/${name}.d.ts`,
    ),
  )
  await consolidateLicenses(output, manifestReaders)
} finally {
  await rm(scratch, {force: true, recursive: true})
}
