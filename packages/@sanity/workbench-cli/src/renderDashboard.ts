/// <reference types="vite/client" />

// Keep this module browser-safe: Vite loads it directly in the generated dashboard runtime.
import {createInstance} from '@module-federation/runtime'
import {BehaviorSubject, type Observable} from 'rxjs'

declare global {
  var __SANITY_STAGING__: boolean | undefined
}

interface DashboardConfig {
  organizationId: string
}

interface RenderDashboardOptions {
  reactStrictMode?: boolean
}

interface DashboardRemoteModule {
  render: (
    rootElement: HTMLElement,
    props: {
      appConfigs?: Observable<unknown[]>
      config: DashboardConfig
      localApplications?: Observable<unknown[]>
    },
    options?: RenderDashboardOptions,
  ) => () => void
}

const remoteName = 'workbench-remote'
const remoteModuleId = `${remoteName}/App`
const localApplicationsEvent = 'sanity:workbench:local-applications'
const noop = () => {}

export async function renderDashboard(
  rootElement: HTMLElement | null,
  config: DashboardConfig,
  options?: RenderDashboardOptions,
): Promise<() => void> {
  if (!rootElement) {
    throw new Error('Missing root element to mount application into')
  }

  const deployedDashboardHost =
    globalThis.__SANITY_STAGING__ === true
      ? 'workbench-apps-of5p8qpku.run.sanity.work'
      : 'workbench-apps-osyh1iet5.sanity.run'
  const remoteUrl =
    import.meta.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL ??
    `https://${deployedDashboardHost}/mf-manifest.json`

  const federation = createInstance({
    name: 'sanity-workbench',
    remotes: [{entry: remoteUrl, name: remoteName}],
  })

  let remoteModule: DashboardRemoteModule | null
  try {
    remoteModule = await federation.loadRemote<DashboardRemoteModule>(remoteModuleId)
  } catch (error) {
    throw new Error(`Failed to load remote module "${remoteModuleId}"`, {cause: error})
  }

  if (!remoteModule || typeof remoteModule.render !== 'function') {
    throw new Error(`Remote module "${remoteModuleId}" did not expose a render function`)
  }

  let appConfigs: BehaviorSubject<unknown[]> | undefined
  let cleanupHmr = noop
  let localApplications: BehaviorSubject<unknown[]> | undefined

  if (import.meta.hot) {
    const hot = import.meta.hot
    const hmrLocalApplications = new BehaviorSubject<unknown[]>([])
    const hmrAppConfigs = new BehaviorSubject<unknown[]>([])
    const handler = (payload: {applications: unknown[]; configs?: unknown[]}) => {
      hmrLocalApplications.next(payload.applications)
      hmrAppConfigs.next(payload.configs ?? [])
    }

    localApplications = hmrLocalApplications
    appConfigs = hmrAppConfigs
    hot.on(localApplicationsEvent, handler)
    hot.send('sanity:workbench:get-local-applications')
    cleanupHmr = () => hot.off(localApplicationsEvent, handler)
  }

  const unmount = remoteModule.render(rootElement, {appConfigs, config, localApplications}, options)

  return () => {
    cleanupHmr()
    unmount()
  }
}
