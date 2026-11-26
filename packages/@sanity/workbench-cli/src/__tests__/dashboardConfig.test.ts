import {describe, test} from 'vitest'

import {defineDashboardConfig} from '../dashboardConfig.js'

describe('defineDashboardConfig', () => {
  test('rejects a tile size outside the tile sizes', () => {
    defineDashboardConfig({
      // @ts-expect-error `medium` is not a tile size.
      views: (views) =>
        views.map((view) =>
          view.surface === 'tile' ? {...view, metadata: {...view.metadata, size: 'medium'}} : view,
        ),
    })
  })

  test('types hiding applications by role and reordering views', () => {
    defineDashboardConfig({
      applications: {
        hidden: (references, {currentUser}) =>
          currentUser.role === 'translator' ? references : [...references, 'acme/translation'],
      },
      views: (views) =>
        views
          .filter(
            (view) =>
              !(view.surface === 'tile' && view.application.reference.startsWith('sanity/')),
          )
          .map((view) =>
            view.surface === 'window' && view.application.reference === 'sanity/canvas'
              ? {...view, metadata: {...view.metadata, dock: {...view.metadata?.dock, order: 1000}}}
              : view,
          ),
    })
  })
})
