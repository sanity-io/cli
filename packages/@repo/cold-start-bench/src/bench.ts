/* eslint-disable no-console */
import {appendFile, mkdir, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'

import {startVersionFilter} from './lib/filter.ts'
import {ensureSpawnHelperExecutable, ENTRY_POINTS, measureRun} from './lib/measure.ts'
import {packWorkingTree} from './lib/pack.ts'
import {npmEnv, publish, seed, startRegistry} from './lib/registry.ts'
import {type ScoredRun, scoreRuns} from './lib/score.ts'

/** Published `sanity` the CLI under test is wrapped in. Bump by hand */
const SANITY_VERSION = '6.17.0'
const MARKER = /Fetching providers/
const TIMEOUT_MS = 300_000

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const stateDir = join(repoRoot, 'node_modules', '.cache', 'cold-start-bench')

function log(message: string) {
  console.error(`[cold-start] ${message}`)
}

const {values} = parseArgs({options: {runs: {default: '1', type: 'string'}}})
const runs = Number(values.runs)
if (!Number.isInteger(runs) || runs < 1)
  throw new Error('--runs must be a whole number of at least 1')

log('Building and packing the working tree')
const packed = await packWorkingTree({
  outDir: join(stateDir, 'packs'),
  repoRoot,
  sanityVersion: SANITY_VERSION,
})

const registry = await startRegistry(stateDir)
const filter = await startVersionFilter(registry.port)
const scratch = await mkdtemp(join(tmpdir(), 'cold-start-'))
try {
  const registryUrl = `http://127.0.0.1:${filter.port}/`
  const env = await npmEnv(registryUrl, scratch)
  for (const pkg of packed) await publish(pkg.file, env)
  filter.setActive(new Map(packed.map((p) => [p.manifest.name, p.manifest.version])))

  log('Loading dependencies into the local registry')
  await seed('sanity@latest', env)
  await seed('create-sanity@latest', env)

  await ensureSpawnHelperExecutable()
  const results: ScoredRun[] = []
  for (let run = 0; run < runs; run++) {
    for (const entry of ENTRY_POINTS) {
      filter.resetStats()
      const result = await measureRun({
        dir: join(scratch, `${entry}-${run}`),
        entry,
        marker: MARKER,
        registryUrl,
        scanTree: run === 0,
        timeoutMs: TIMEOUT_MS,
      })
      results.push({...result, ...filter.resetStats(), entry})
      log(`${entry} run ${run + 1}/${runs}: ${result.end}`)
    }
  }

  const score = scoreRuns(results)
  await mkdir(stateDir, {recursive: true})
  await appendFile(
    join(stateDir, 'history.jsonl'),
    `${JSON.stringify({at: new Date().toISOString(), passed: score.passed, score: score.score})}\n`,
  )
  console.log(JSON.stringify({...score, runs: results.map(({tree: _tree, ...r}) => r)}, null, 2))
  process.exitCode = score.passed ? 0 : 1
} finally {
  await filter.close()
  await registry.stop()
  await rm(scratch, {force: true, maxRetries: 10, recursive: true, retryDelay: 200})
}
