import {stat} from 'node:fs/promises'
import {join} from 'node:path'

/** The `unstable_defineApp` fields that become federation exposes. */
interface WorkbenchAppInterfaces {
  entry?: string
  services?: unknown[]
  views?: unknown[]
}

/**
 * Checks that the app config declares at least one interface — an `entry`,
 * a view, or a service. These are exactly what the build exposes, so a
 * federated app that declares none would ship a remote that contains nothing
 * to load. Reading the config settles this before any prompts, API calls or
 * build artifacts. Workbench studios always expose the studio config and
 * don't need this check.
 *
 * @internal
 * @param app - The branded `unstable_defineApp` result from the CLI config
 */
export function checkCanDeployWorkbenchApp(app: WorkbenchAppInterfaces): void {
  const {entry, services, views} = app
  if (!entry && !views?.length && !services?.length) {
    throw new Error(
      'Nothing to deploy: `unstable_defineApp` declares no entry, views or services. ' +
        'Declare an entry or at least one view or service in the app config.',
    )
  }
}

/**
 * Checks that the directory exists, is a directory and contains a federation
 * build. Workbench (`unstable_defineApp`) builds emit a module federation
 * remote instead of a static SPA, so `checkDir`'s `index.html` contract does
 * not apply to them. `mf-manifest.json` presence is the marker that "sanity
 * build" produced a federation build — whether the app declares anything to
 * expose is settled by {@link checkCanDeployWorkbenchApp} before the build runs.
 *
 * @internal
 * @param sourceDir - The directory to check
 */
export async function checkWorkbenchAppDir(sourceDir: string): Promise<void> {
  try {
    const stats = await stat(sourceDir)
    if (!stats.isDirectory()) {
      throw new Error(`Directory ${sourceDir} is not a directory`)
    }
  } catch (err) {
    const error = err.code === 'ENOENT' ? new Error(`Directory "${sourceDir}" does not exist`) : err

    throw error
  }

  const manifestPath = join(sourceDir, 'mf-manifest.json')
  try {
    await stat(manifestPath)
  } catch (err) {
    const error =
      err.code === 'ENOENT'
        ? new Error(
            `"${manifestPath}" does not exist. ` +
              'The deploy directory must contain a federation build created with "sanity build".',
          )
        : err

    throw error
  }
}
