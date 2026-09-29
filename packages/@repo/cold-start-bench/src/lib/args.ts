import {parseArgs} from 'node:util'

export interface BenchArgs {
  base: string | null
  config: string | null
  freshRegistry: boolean
  /** A git ref, or `null` for the working tree as it is on disk */
  head: string | null
  help: boolean
  json: boolean
  out: string | null
  runs: number | null
  stateDir: string | null
}

export const USAGE = `Usage: pnpm bench:cold-start [options]

Measures how long a new user waits, with an empty npm cache, for the first
output of \`npx sanity init\` and \`npm create sanity\`.

Options:
  --base <ref>        Git ref to compare against (e.g. main). Omit to measure head alone
  --head <ref>        Git ref to measure. Default: the working tree, uncommitted changes included
  --runs <n>          Runs per variant and entry point (default from bench.config.json)
  --config <path>     Config file (default: bench.config.json in this package)
  --state-dir <dir>   Registry storage, package cache and history
                      (default: node_modules/.cache/cold-start-bench)
  --out <dir>         Where to write results.json and report.md
  --fresh-registry    Delete the registry's storage and fetch everything from npm again
  --json              Print a JSON summary instead of the markdown report
  -h, --help          Show this help

Exit code: 0 when every check passes, 1 when a check fails, 2 on errors.`

export function parseBenchArgs(argv: readonly string[]): BenchArgs {
  const {values} = parseArgs({
    allowPositionals: false,
    args: [...argv],
    options: {
      'base': {type: 'string'},
      'config': {type: 'string'},
      'fresh-registry': {default: false, type: 'boolean'},
      'head': {type: 'string'},
      'help': {default: false, short: 'h', type: 'boolean'},
      'json': {default: false, type: 'boolean'},
      'out': {type: 'string'},
      'runs': {type: 'string'},
      'state-dir': {type: 'string'},
    },
    strict: true,
  })

  let runs: number | null = null
  if (values.runs !== undefined) {
    runs = Number(values.runs)
    if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a whole number of at least 1')
  }

  return {
    base: values.base ?? null,
    config: values.config ?? null,
    freshRegistry: values['fresh-registry'],
    head: values.head ?? null,
    help: values.help,
    json: values.json,
    out: values.out ?? null,
    runs,
    stateDir: values['state-dir'] ?? null,
  }
}
