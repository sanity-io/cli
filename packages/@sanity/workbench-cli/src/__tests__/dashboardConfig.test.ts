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

  test('types installations among the applications, with their views but no back-reference', () => {
    defineDashboardConfig({
      applications: {
        hidden: (references, {applications}) =>
          applications
            .filter((application) => application.type === 'installation' && application.isLocal)
            .map((application) => application.reference),
        visible: (references, {applications}) =>
          applications.flatMap((application) =>
            // @ts-expect-error A view in the applications context has no `application`.
            application.views.map((view) => view.application.reference),
          ),
      },
    })
  })

  test('hides fields only the application record carries', () => {
    defineDashboardConfig({
      applications: {
        hidden: (references, {applications}) => {
          // @ts-expect-error `createdAt` is not part of a view application.
          const created = applications.filter((application) => application.createdAt)

          return created.map((application) => application.reference)
        },
      },
    })
  })
})
