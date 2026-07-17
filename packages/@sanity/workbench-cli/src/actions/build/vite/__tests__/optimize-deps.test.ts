import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {type WorkbenchExposes} from '../../../../resolveWorkbenchApp.js'
import {workbenchOptimizeDeps} from '../optimize-deps.js'

const cwd = path.resolve('/project')

describe('workbenchOptimizeDeps', () => {
  test('always pre-bundles the render-contract react deps', () => {
    const {include} = workbenchOptimizeDeps({appSources: [], cwd})

    expect(include).toEqual(['react', 'react-dom/client'])
  })

  test('scans the app entry and every exposed view/service/config source', () => {
    const exposes: WorkbenchExposes = {
      config: {
        appType: 'media-library',
        fields: [{name: 'credit', src: './src/fields/credit.ts', title: 'Credit'}],
      },
      services: [{name: 'reminders', src: './src/service.ts', type: 'worker'}],
      views: [
        {name: 'favorites', src: './src/FavoritesPanel.tsx', title: 'Favorites', type: 'panel'},
      ],
    }

    const {entries} = workbenchOptimizeDeps({
      appSources: [path.join(cwd, 'src', 'App.tsx')],
      cwd,
      exposes,
    })

    expect(entries).toEqual([
      'src/App.tsx',
      'src/FavoritesPanel.tsx',
      'src/service.ts',
      'src/fields/credit.ts',
    ])
  })

  test('scans a studio config as its app source', () => {
    const {entries} = workbenchOptimizeDeps({
      appSources: [path.join(cwd, 'sanity.config.ts')],
      cwd,
    })

    expect(entries).toEqual(['sanity.config.ts'])
  })

  test('returns entries relative to cwd with forward slashes', () => {
    const {entries} = workbenchOptimizeDeps({
      appSources: [path.join(cwd, 'src', 'nested', 'App.tsx')],
      cwd,
    })

    expect(entries).toEqual(['src/nested/App.tsx'])
  })

  test('dedupes a source shared by the entry and an exposed view', () => {
    const {entries} = workbenchOptimizeDeps({
      appSources: [path.join(cwd, 'src', 'App.tsx')],
      cwd,
      exposes: {views: [{name: 'app', src: './src/App.tsx', title: 'App', type: 'panel'}]},
    })

    expect(entries).toEqual(['src/App.tsx'])
  })

  test('handles a dock-only app with no app sources', () => {
    const {entries} = workbenchOptimizeDeps({
      appSources: [],
      cwd,
      exposes: {
        views: [
          {name: 'favorites', src: './src/FavoritesPanel.tsx', title: 'Favorites', type: 'panel'},
        ],
      },
    })

    expect(entries).toEqual(['src/FavoritesPanel.tsx'])
  })

  // `optimizeDeps.entries` is matched against the filesystem, so an
  // extensionless source (the default `./src/App`) must resolve to its real file
  // or Vite skips it and its deps go unscanned.
  describe('extension resolution', () => {
    let projectDir: string

    beforeEach(() => {
      projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-optimize-deps-'))
      fs.mkdirSync(path.join(projectDir, 'src'), {recursive: true})
    })

    afterEach(() => {
      fs.rmSync(projectDir, {force: true, recursive: true})
    })

    test('resolves an extensionless app entry to its on-disk file', () => {
      fs.writeFileSync(path.join(projectDir, 'src', 'App.tsx'), 'export default {}')

      const {entries} = workbenchOptimizeDeps({
        appSources: [path.join(projectDir, 'src', 'App')],
        cwd: projectDir,
      })

      expect(entries).toEqual(['src/App.tsx'])
    })

    test('resolves an extensionless interface source to its on-disk file', () => {
      fs.writeFileSync(path.join(projectDir, 'src', 'service.ts'), 'export default {}')

      const {entries} = workbenchOptimizeDeps({
        appSources: [],
        cwd: projectDir,
        exposes: {services: [{name: 'reminders', src: './src/service', type: 'worker'}]},
      })

      expect(entries).toEqual(['src/service.ts'])
    })

    test('leaves an already-extensioned source untouched', () => {
      fs.writeFileSync(path.join(projectDir, 'src', 'App.tsx'), 'export default {}')

      const {entries} = workbenchOptimizeDeps({
        appSources: [path.join(projectDir, 'src', 'App.tsx')],
        cwd: projectDir,
      })

      expect(entries).toEqual(['src/App.tsx'])
    })
  })
})
