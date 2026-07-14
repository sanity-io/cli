import {type WorkbenchExposes} from '../../resolveWorkbenchApp.js'
import {type BrettInterface} from '../../services/applications.js'

interface BuildExposesContext {
  appName: string
  appTitle: string
  /** Whether the build exposes the app view (`./App`) — apps with an `entry`, and every studio. */
  exposesAppView: boolean
  version: string
}

/**
 * The interface records deploy sends: the app view (only when `exposesAppView`),
 * every view, and every service.
 * @internal
 */
export function buildExposes(
  exposes: WorkbenchExposes,
  {appName, appTitle, exposesAppView, version}: BuildExposesContext,
): BrettInterface[] {
  const toRecord = (
    prefix: string,
    decl: {name: string; title?: string; type: string},
  ): BrettInterface => ({
    moduleId: `${prefix}/${decl.name}`,
    name: decl.name,
    title: decl.title ?? decl.name,
    type: decl.type,
    version,
  })

  const records: BrettInterface[] = []
  if (exposesAppView) {
    records.push({moduleId: 'App', name: appName, title: appTitle, type: 'app', version})
  }
  for (const view of exposes.views ?? []) records.push(toRecord('views', view))
  for (const service of exposes.services ?? []) records.push(toRecord('services', service))
  return records
}

/** A view or service as the deploy report and `--json` output surface it. */
export interface DeployedExpose {
  name: string
  src: string
  title: string
  type: string
}

const label = (item: {name: string; title: string}) =>
  item.title === item.name ? item.name : `${item.title} (${item.name})`

/**
 * One `Title (name): src` report line per declared entry point.
 * @internal
 */
export function summarizeExposeGroup(
  heading: string,
  items: readonly {name: string; src: string; title: string}[],
): string {
  return `${heading}:\n${items.map((item) => `  ${label(item)}: ${item.src}`).join('\n')}`
}

/**
 * The deploy summary of an app's exposes: the structured records (for `--json`)
 * and one report line per non-empty group (for the human report).
 * @internal
 */
export function summarizeExposes({services, views}: WorkbenchExposes): {
  exposes: DeployedExpose[]
  lines: string[]
} {
  const toExpose = (decl: {
    name: string
    src: string
    title?: string
    type: string
  }): DeployedExpose => ({
    name: decl.name,
    src: decl.src,
    title: decl.title ?? decl.name,
    type: decl.type,
  })
  const viewExposes = (views ?? []).map((view) => toExpose(view))
  const serviceExposes = (services ?? []).map((service) => toExpose(service))

  const lines: string[] = []
  if (viewExposes.length > 0) lines.push(summarizeExposeGroup('Views', viewExposes))
  if (serviceExposes.length > 0) lines.push(summarizeExposeGroup('Services', serviceExposes))
  return {exposes: [...viewExposes, ...serviceExposes], lines}
}
