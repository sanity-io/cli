import {parseArgs} from 'node:util'

import {ENTRY_POINTS, type EntryPoint} from './measure.ts'

export function benchOptions(args: string[]): {
  dataset: string
  entries: EntryPoint[]
  mode: 'all' | 'prompt' | 'setup'
  project: string
  runs: number
  template: 'blog' | 'clean' | 'moviedb'
  timeoutMs: number
} {
  const {values} = parseArgs({
    args,
    options: {
      dataset: {default: 'production', type: 'string'},
      entry: {default: 'all', type: 'string'},
      mode: {default: 'all', type: 'string'},
      project: {default: 'bench123', type: 'string'},
      runs: {default: '3', type: 'string'},
      template: {default: 'clean', type: 'string'},
      'timeout-ms': {default: '600000', type: 'string'},
    },
  })
  const runs = Number(values.runs)
  const timeoutMs = Number(values['timeout-ms'])
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error('--runs must be a whole number of at least 1')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
    throw new Error('--timeout-ms must be a positive integer')
  const {dataset, mode, project, template} = values
  if (mode !== 'all' && mode !== 'setup' && mode !== 'prompt')
    throw new Error('--mode must be all, setup, or prompt')
  if (template !== 'clean' && template !== 'blog' && template !== 'moviedb')
    throw new Error('--template must be clean, blog, or moviedb')
  if (!/^[a-z0-9-]+$/.test(project)) throw new Error('--project must be a valid fixture project ID')
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dataset))
    throw new Error('--dataset must be a valid fixture dataset name')
  const entries = ENTRY_POINTS.filter((entry) => values.entry === 'all' || values.entry === entry)
  if (entries.length === 0) throw new Error(`--entry must be all or ${ENTRY_POINTS.join(', ')}`)
  return {dataset, entries, mode, project, runs, template, timeoutMs}
}
