import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {describe, expect, test} from 'vitest'

import {loadConfig, parseConfig} from '../config.ts'

const valid = {
  entries: {'npm-create-sanity': {weight: 0.5}, 'npx-sanity-init': {weight: 0.5}},
  marker: 'Fetching providers',
  network: {downMbps: 50, rttMs: 40, upMbps: 10},
  runs: 3,
  sanityVersion: '6.13.2',
  thresholds: {
    markerGapIncreaseMs: 250,
    packageCountIncrease: 0,
    timeRegressionMinMs: 1000,
    timeRegressionSpreads: 3,
    wireBytesIncreasePercent: 1,
  },
  timeoutMs: 240_000,
}

describe('parseConfig', () => {
  test('accepts a valid config', () => {
    expect(parseConfig(valid)).toEqual(valid)
  })

  test.each([
    ['not an object', null, 'expected an object'],
    ['a range as sanity version', {...valid, sanityVersion: '^6'}, 'sanityVersion'],
    ['an empty marker', {...valid, marker: ''}, 'marker'],
    ['a missing weight', {...valid, entries: {'npx-sanity-init': {weight: 1}}}, 'npm-create-sanity'],
    [
      'an unknown entry',
      {...valid, entries: {...valid.entries, 'yarn-create': {weight: 0}}},
      'unknown entries: yarn-create',
    ],
    ['zero runs', {...valid, runs: 0}, 'at least 1'],
    ['fractional runs', {...valid, runs: 1.5}, 'at least 1'],
    ['a negative threshold', {...valid, thresholds: {...valid.thresholds, packageCountIncrease: -1}}, 'packageCountIncrease'],
    ['missing thresholds', {...valid, thresholds: undefined}, 'thresholds.markerGapIncreaseMs'],
    ['a string network value', {...valid, network: {...valid.network, rttMs: '40'}}, 'network.rttMs'],
  ])('rejects %s', (_, input, message) => {
    expect(() => parseConfig(input)).toThrow(message)
  })
})

describe('loadConfig', () => {
  test('reads and validates a JSON file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cold-start-config-'))
    try {
      const path = join(dir, 'bench.config.json')
      await writeFile(path, JSON.stringify(valid))
      expect(await loadConfig(path)).toEqual(valid)
    } finally {
      await rm(dir, {force: true, recursive: true})
    }
  })
})
