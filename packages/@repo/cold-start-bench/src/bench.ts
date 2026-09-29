/* eslint-disable no-console */
import {appendFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {arch, platform, tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {execa} from 'execa'

import {parseBenchArgs, USAGE} from './lib/args.ts'
import {
  compareVariants,
  type RunResult,
  score,
  summarizeVariant,
  type VariantSummary,
} from './lib/compare.ts'
import {ENTRY_POINTS, type EntryPoint, loadConfig} from './lib/config.ts'
import {startVersionFilter} from './lib/filter.ts'
import {acquireLock} from './lib/lock.ts'
import {ensureSpawnHelperExecutable, measureRun} from './lib/measure.ts'
import {type PackedVariant, packRef, packWorkingTree} from './lib/pack.ts'
import {npmEnv, publish, seed, startRegistry, wrapSanity} from './lib/registry.ts'
import {type BenchResults, buildReport} from './lib/report.ts'
import {startThrottleProxy} from './lib/throttle.ts'
import {diffTrees, type TreeDiff} from './lib/tree.ts'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageDir, '..', '..', '..')

function log(message: string) {
  console.error(`[cold-start] ${message}`)
}

async function main(): Promise<number> {
  const args = parseBenchArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return 0
  }

  const config = await loadConfig(args.config ?? join(packageDir, 'bench.config.json'))
  if (args.runs) config.runs = args.runs
  const stateDir = resolve(
    args.stateDir ?? join(repoRoot, 'node_modules', '.cache', 'cold-start-bench'),
  )
  const marker = new RegExp(config.marker.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))

  const release = await acquireLock(stateDir, {
    onWait: (pid) => log(`Waiting for another measurement to finish (pid ${pid})`),
  })
  const cleanup: (() => Promise<void>)[] = [release]
  const onSignal = () => {
    void Promise.allSettled(cleanup.toReversed().map((fn) => fn())).then(() => process.exit(130))
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    if (args.freshRegistry) await rm(join(stateDir, 'registry'), {force: true, recursive: true})

    const variants: Record<string, PackedVariant> = {}
    if (args.base) {
      variants.base = await packRef({label: args.base, log, ref: args.base, repoRoot, stateDir})
    }
    variants.head = args.head
      ? await packRef({label: args.head, log, ref: args.head, repoRoot, stateDir})
      : await packWorkingTree({log, repoRoot, stateDir})

    log('Starting the local registry')
    const registry = await startRegistry(stateDir)
    cleanup.push(registry.stop)
    const filter = await startVersionFilter(registry.port)
    cleanup.push(filter.close)
    // All npm traffic goes through the throttle and the filter, so the filter's
    // cached metadata carries tarball URLs for the throttle's address. The
    // throttle stays off until the timed runs.
    const proxy = await startThrottleProxy({profile: config.network, targetPort: filter.port})
    cleanup.push(proxy.close)
    proxy.setThrottled(false)
    const proxyUrl = `http://127.0.0.1:${proxy.port}/`
    const npmDir = await mkdtemp(join(tmpdir(), 'cold-start-npm-'))
    cleanup.push(() => rm(npmDir, {force: true, recursive: true}))
    const env = await npmEnv(proxyUrl, npmDir)

    // Package name → bench version, per variant
    const active: Record<string, Map<string, string>> = {}
    for (const [name, variant] of Object.entries(variants)) {
      log(`Publishing ${name} (${variant.id}) to the local registry`)
      for (const pkg of variant.packages) await publish(pkg.file, env)
      const sanity = await wrapSanity({
        cli: variant.packages,
        env,
        id: variant.id,
        outDir: dirname(variant.packages[0].file),
        sanityVersion: config.sanityVersion,
      })
      await publish(sanity.file, env)
      active[name] = new Map([...variant.packages, sanity].map((p) => [p.name, p.version]))

      log(`Filling the registry with ${name}'s dependencies`)
      filter.setActive(active[name])
      await seed('sanity@latest', env)
      await seed('create-sanity@latest', env)
    }

    await ensureSpawnHelperExecutable()
    proxy.setThrottled(true)

    const runs: RunResult[] = []
    const names = Object.keys(variants)
    const runDir = await mkdtemp(join(tmpdir(), 'cold-start-run-'))
    cleanup.push(() => rm(runDir, {force: true, recursive: true}))
    for (let run = 0; run < config.runs; run++) {
      for (const entry of ENTRY_POINTS) {
        // Alternate which variant goes first so neither always gets the quieter slot
        const order = run % 2 === 0 ? names : names.toReversed()
        for (const variant of order) {
          filter.setActive(active[variant])
          proxy.resetStats()
          const result = await measureRun({
            dir: join(runDir, `${variant}-${entry}-${run}`),
            entry,
            marker,
            registryUrl: proxyUrl,
            scanTree: run === 0,
            timeoutMs: config.timeoutMs,
          })
          const wire = proxy.resetStats()
          runs.push({
            ...result,
            run,
            variant,
            wireBytesDown: wire.bytesDown,
            wireBytesUp: wire.bytesUp,
            wireConnections: wire.connections,
          })
          const took =
            result.firstOutputMs === null
              ? `no output (${result.end})`
              : `${(result.firstOutputMs / 1000).toFixed(2)}s`
          log(`Run ${run + 1}/${config.runs} ${entry} ${variant}: ${took}`)
        }
      }
    }

    const summaries: Record<string, VariantSummary> = {}
    const scores: Record<string, number | null> = {}
    for (const name of names) {
      summaries[name] = summarizeVariant(runs, name)
      scores[name] = score(summaries[name], config.entries)
    }

    const treeDiffs: Partial<Record<EntryPoint, TreeDiff>> = {}
    if (variants.base) {
      for (const entry of ENTRY_POINTS) {
        const tree = (v: string) =>
          runs.find((r) => r.variant === v && r.entry === entry && r.tree)?.tree
        const baseTree = tree('base')
        const headTree = tree('head')
        if (baseTree && headTree) treeDiffs[entry] = diffTrees(baseTree, headTree)
      }
    }

    const checks = variants.base
      ? compareVariants(summaries.base, summaries.head, config.thresholds)
      : []
    const incomplete = !variants.base && ENTRY_POINTS.some((e) => summaries.head[e].failedRuns > 0)

    const {stdout: npmVersion} = await execa('npm', ['--version'])
    const results: BenchResults = {
      checks,
      config,
      environment: {node: process.version, npm: npmVersion, os: `${platform()} ${arch()}`},
      scores,
      summaries,
      treeDiffs,
      variants: Object.fromEntries(
        Object.entries(variants).map(([name, v]) => [name, {id: v.id, label: v.label, sha: v.sha}]),
      ),
    }

    const outDir = resolve(
      args.out ?? join(stateDir, 'results', new Date().toISOString().replaceAll(':', '-')),
    )
    await mkdir(outDir, {recursive: true})
    const report = buildReport(results)
    await writeFile(
      join(outDir, 'results.json'),
      `${JSON.stringify({...results, runs}, null, 2)}\n`,
    )
    await writeFile(join(outDir, 'report.md'), report)
    await appendFile(
      join(stateDir, 'history.jsonl'),
      `${JSON.stringify({at: new Date().toISOString(), checks, outDir, scores, variants: results.variants})}\n`,
    )
    log(`Results written to ${outDir}`)

    const failed = incomplete || checks.some((c) => c.status === 'fail')
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            checks,
            passed: !failed,
            results: join(outDir, 'results.json'),
            score: scores.head,
            scores,
            summaries,
            treeDiffs,
          },
          null,
          2,
        ),
      )
    } else {
      console.log(report)
    }
    return failed ? 1 : 0
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    for (const fn of cleanup.toReversed()) await fn().catch(() => {})
  }
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 2
}
