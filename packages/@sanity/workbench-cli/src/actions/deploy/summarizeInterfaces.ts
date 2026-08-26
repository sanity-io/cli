import {type ServiceType, type ViewSurface} from '../../contract.js'
import {type WorkbenchExposes} from '../../resolveWorkbenchApp.js'

interface DeployedInterfaceBase {
  name: string
  src: string
  title: string
}

/** A view as the deploy report and `--json` output surface it. */
export interface DeployedView extends DeployedInterfaceBase {
  surface: ViewSurface
}

/** A web worker as the deploy report and `--json` output surface it. */
export interface DeployedWebWorker extends DeployedInterfaceBase {
  type: ServiceType
}

export type DeployedInterface = DeployedView | DeployedWebWorker

const label = (item: {name: string; title: string}) =>
  item.title === item.name ? item.name : `${item.title} (${item.name})`

/**
 * One `Title (name): src` report line per declared entry point.
 * @internal
 */
export function summarizeGroup(
  heading: string,
  items: readonly {name: string; src: string; title: string}[],
): string {
  return `${heading}:\n${items.map((item) => `  ${label(item)}: ${item.src}`).join('\n')}`
}

/**
 * One report line per non-empty group, alongside the records `--json` reports.
 * @internal
 */
export function summarizeInterfaces({views, webWorkers}: WorkbenchExposes): {
  lines: string[]
  services: DeployedWebWorker[]
  views: DeployedView[]
} {
  const deployedViews = (views ?? []).map(
    (view): DeployedView => ({
      name: view.name,
      src: view.src,
      surface: view.surface,
      title: view.title,
    }),
  )
  const deployedServices = (webWorkers ?? []).map(
    (webWorker): DeployedWebWorker => ({
      name: webWorker.name,
      src: webWorker.src,
      title: webWorker.title,
      type: webWorker.type,
    }),
  )

  const lines: string[] = []
  if (deployedViews.length > 0) lines.push(summarizeGroup('Views', deployedViews))
  if (deployedServices.length > 0) lines.push(summarizeGroup('Web workers', deployedServices))
  return {lines, services: deployedServices, views: deployedViews}
}
