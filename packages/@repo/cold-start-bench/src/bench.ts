/* eslint-disable no-console */
import {appendFile, mkdir, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {execa} from 'execa'

import {startApiFixture} from './lib/apiFixture.ts'
import {startVersionFilter} from './lib/filter.ts'
import {ensureSpawnHelperExecutable, type EntryPoint, measureRun} from './lib/measure.ts'
import {benchOptions} from './lib/options.ts'
import {packWorkingTree} from './lib/pack.ts'
import {npmEnv, publish, seed, startRegistry} from './lib/registry.ts'
import {median, modelDownloadMs, type ScoredRun, scoreEntry} from './lib/score.ts'
import {measureSetup, type SetupRun, templateFiles} from './lib/setup.ts'

/** Published Studio used for both entry points and the generated project. */
const SANITY_VERSION = '6.17.0'
// Observe a full provider selector; never write to the PTY or count its spinner.
const PROMPT = /Please log in or create a new account[\s\S]*❯[\s\S]*SSO/
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const stateDir = join(repoRoot, 'node_modules', '.cache', 'cold-start-bench')
const options = benchOptions(process.argv.slice(2))
const log = (message: string) => console.error(`[cold-start] ${message}`)

log('Building and packing the working tree')
const packed = await packWorkingTree({
  outDir: join(stateDir, 'packs'),
  repoRoot,
  sanityVersion: SANITY_VERSION,
})
const expectedFiles = await templateFiles(repoRoot, options.template)
const registry = await startRegistry(stateDir)
const scratch = await mkdtemp(join(tmpdir(), 'cold-start-'))
let filter: Awaited<ReturnType<typeof startVersionFilter>> | undefined
let fixture: Awaited<ReturnType<typeof startApiFixture>> | undefined
try {
  filter = await startVersionFilter(registry.port)
  const registryUrl = `http://127.0.0.1:${filter.port}/`
  fixture = await startApiFixture({...options, dir: scratch, registryUrl})
  const env = await npmEnv(registryUrl, scratch)
  for (const pkg of packed) await publish(pkg.file, env)
  filter.setActive(new Map(packed.map((p) => [p.manifest.name, p.manifest.version])))

  log('Loading dependencies into the local registry')
  await seed('sanity@latest', env)
  await seed('create-sanity@latest', env)
  const setup = (entry: EntryPoint, name: string) =>
    measureSetup({
      ...options,
      dir: join(scratch, name),
      entry,
      env: fixture!.env,
      expectedFiles,
      registryUrl,
    })
  if (options.mode !== 'prompt') {
    log('Warming the project dependency mirror and checking unattended setup')
    const warmup = await setup(options.entries[0], 'warmup')
    if (warmup.end !== 'completed' || fixture.unexpected.length > 0) {
      throw new Error(
        `Setup warmup failed: ${JSON.stringify({unexpected: fixture.unexpected, warmup})}`,
      )
    }
  }
  if (options.mode !== 'setup') await ensureSpawnHelperExecutable()
  const downloadStats = () => {
    const packages = filter!.resetStats()
    const native = fixture!.resetStats()
    return {bytes: packages.bytes + native.bytes, requests: packages.requests + native.requests}
  }
  const promptRuns: ScoredRun[] = []
  const setupRuns: (SetupRun & {bytes: number; entry: EntryPoint; requests: number})[] = []
  for (let run = 0; run < options.runs; run++) {
    for (const entry of options.entries) {
      if (options.mode !== 'setup') {
        filter.resetStats()
        fixture.resetStats()
        const result = await measureRun({
          dir: join(scratch, `${entry}-prompt-${run}`),
          entry,
          env: {...fixture.env, DO_NOT_TRACK: '1'},
          marker: PROMPT,
          registryUrl,
          scanTree: run === 0,
          timeoutMs: options.timeoutMs,
        })
        promptRuns.push({...result, ...downloadStats(), entry})
        log(`${entry} prompt ${run + 1}/${options.runs}: ${result.markerMs ?? result.end}ms`)
      }
      if (options.mode !== 'prompt') {
        filter.resetStats()
        fixture.resetStats()
        const result = await setup(entry, `${entry}-setup-${run}`)
        setupRuns.push({...result, ...downloadStats(), entry})
        log(
          `${entry} setup ${run + 1}/${options.runs}: ${result.studioRunningMs ?? result.error}ms`,
        )
      }
    }
  }
  const entries = Object.fromEntries(
    options.entries.map((entry) => {
      const prompts = promptRuns.filter((run) => run.entry === entry)
      const setups = setupRuns.filter((run) => run.entry === entry)
      const complete = setups.filter((run) => run.end === 'completed')
      const timing = (key: 'filesGeneratedMs' | 'setupCompleteMs' | 'studioRunningMs') =>
        complete.length > 0 ? median(complete.map((run) => run[key]!)) : null
      return [
        entry,
        {
          prompt: prompts.length > 0 ? scoreEntry(prompts) : null,
          setup:
            setups.length > 0
              ? {
                  bytesDownloaded: median(setups.map((run) => run.bytes)),
                  failures: setups.length - complete.length,
                  filesGeneratedMs: timing('filesGeneratedMs'),
                  modeledStudioRunningMs:
                    complete.length > 0
                      ? median(
                          complete.map(
                            (run) =>
                              run.studioRunningMs! + modelDownloadMs(run.bytes, run.requests),
                          ),
                        )
                      : null,
                  setupCompleteMs: timing('setupCompleteMs'),
                  studioRunningMs: timing('studioRunningMs'),
                }
              : null,
        },
      ]
    }),
  )
  const passed =
    fixture.unexpected.length === 0 &&
    promptRuns.every((run) => run.end === 'marker') &&
    setupRuns.every((run) => run.end === 'completed')
  const revision = (await execa('git', ['rev-parse', 'HEAD'], {cwd: repoRoot})).stdout
  const dirty = Boolean((await execa('git', ['status', '--porcelain'], {cwd: repoRoot})).stdout)
  const result = {
    at: new Date().toISOString(),
    dirty,
    entries,
    node: process.version,
    npm: (await execa('npm', ['--version'])).stdout,
    options,
    packages: packed.map(({manifest}) => ({name: manifest.name, version: manifest.version})),
    passed,
    promptRuns: promptRuns.map(({tree: _tree, ...run}) => run),
    revision,
    schemaVersion: 2,
    setupRuns,
    unexpectedApiRequests: fixture.unexpected,
  }
  await mkdir(stateDir, {recursive: true})
  await appendFile(join(stateDir, 'history.jsonl'), `${JSON.stringify(result)}\n`)
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = passed ? 0 : 1
} finally {
  await fixture?.close()
  await filter?.close()
  await registry.stop()
  await rm(scratch, {force: true, maxRetries: 10, recursive: true, retryDelay: 200})
}
