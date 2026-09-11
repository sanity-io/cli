import {describe, expect, test} from 'vitest'

import {artifactExposes, type GeneratedArtifact, workbenchArtifacts} from '../artifact.js'

describe('artifactExposes', () => {
  test('maps only the artifacts the host loads directly, through toExposePath', () => {
    const artifacts: GeneratedArtifact[] = [
      {path: 'services/unread/worker.js', source: () => ''},
      {expose: './services/unread', path: 'services/unread/index.js', source: () => ''},
      {expose: './views/feed/panel', path: 'views/feed/panel.js', source: () => ''},
    ]
    expect(artifactExposes(artifacts, (path) => `./runtime/${path}`)).toEqual({
      './services/unread': './runtime/services/unread/index.js',
      './views/feed/panel': './runtime/views/feed/panel.js',
    })
  })

  test('returns an empty map when no artifact is exposed', () => {
    const artifacts: GeneratedArtifact[] = [{path: 'services/unread/worker.js', source: () => ''}]
    expect(artifactExposes(artifacts, (path) => path)).toEqual({})
  })
})

describe('workbenchArtifacts', () => {
  test('composes view, service, and config artifacts in that order', () => {
    const artifacts = workbenchArtifacts({
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
      views: [{name: 'feed', size: 'small', src: './src/feed.tsx', surface: 'tile', title: 'Feed'}],
      webWorkers: [{name: 'unread', src: './src/unread.ts', title: 'Unread', type: 'worker'}],
    })
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      'views/feed/tile.js',
      'services/unread/worker.js',
      'services/unread/index.js',
      'configs/installation_config.js',
    ])
  })

  test('returns nothing when the app exposes nothing', () => {
    expect(workbenchArtifacts({})).toEqual([])
  })
})
