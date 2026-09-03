import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, expect, test} from 'vitest'

import {FEDERATION_FILE_NAME, RUNTIME_DIR} from '../constants.js'
import {
  type FederationRuntimeOptions,
  sanityFederationRuntime,
} from './plugin-sanity-federation-runtime.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, {force: true, recursive: true})
})

/** Run the plugin's `configResolved` against a throwaway root and read the entry it wrote. */
function writeEntry(options: FederationRuntimeOptions): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'federation-runtime-'))
  roots.push(root)

  const plugin = sanityFederationRuntime(options)
  const configResolved = plugin.configResolved as (config: {root: string}) => void
  configResolved({root})

  return fs.readFileSync(path.join(root, RUNTIME_DIR, `${FEDERATION_FILE_NAME}.jsx`), 'utf8')
}

test('an SDK app entry renders through the lifecycle harness', () => {
  const entry = writeEntry({appEntry: '/app/src/App.tsx', isApp: true})

  expect(entry).toContain('dispose.setLifecycle')
  expect(entry).toContain(`import App from "/app/src/App.tsx"`)
})

test('a studio entry renders through the lifecycle harness', () => {
  const entry = writeEntry({isApp: false, studioConfigPath: '/studio/sanity.config.ts'})

  expect(entry).toContain('dispose.setLifecycle')
  expect(entry).toContain('import.meta.hot')
})

test('a headless app exposes no `./App`, so it carries no controller', () => {
  const entry = writeEntry({isApp: true})

  expect(entry).not.toContain('setLifecycle')
  expect(entry).toContain('This application has no app view')
})
