import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {subdebug} from '@sanity/cli-core'
import {c as createTar} from 'tar'

import {
  createDashboard,
  createDashboardConfig,
  type Dashboard,
  deleteDashboard,
} from '../../services/dashboards.js'

const debug = subdebug('deploy')

export async function uploadDashboardConfig(options: {
  dashboard: Dashboard | undefined
  organizationId: string
  sourceDir: string
  version: string
}): Promise<void> {
  const {dashboard, organizationId, sourceDir, version} = options
  const tarball = createTar({cwd: dirname(sourceDir)}, [basename(sourceDir)]).pipe(createGzip())

  if (dashboard) {
    return createDashboardConfig(dashboard.id, {tarball, version})
  }

  const created = await createDashboard(organizationId)

  try {
    return await createDashboardConfig(created.id, {tarball, version})
  } catch (err) {
    await deleteDashboard(created.id).catch((cleanupErr) =>
      debug(
        'Failed to remove Dashboard %s after a failed config upload: %O',
        created.id,
        cleanupErr,
      ),
    )
    throw err
  }
}
